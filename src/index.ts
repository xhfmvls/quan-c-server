// src/index.ts
import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import cors from 'cors';
import axios from 'axios';
import multer from 'multer';
import unzipper from 'unzipper';
import { v4 as uuidv4 } from 'uuid';
import { Readable, Writable } from 'stream';
import fs, { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';
import { chdir } from 'process';
const { PrismaClient } = require('@prisma/client');
require('express-async-errors');

dotenv.config();
const app = express();
const port = 8000;
const service_port = 8080;
const storage = multer.memoryStorage();
const prisma = new PrismaClient();
app.use(cors());
app.use(bodyParser.json());

const CLIENT_ID = process.env.CLIENT_ID || "";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "";
const REPO_PERSONAL_TOKEN = process.env.REPO_PERSONAL_TOKEN || "";

// Types

interface Challenge {
    challenge_id: string;
    challenge_title: string;
    repo_link: string;
    points: number;
    total_test_case: number;
    Tagassign: Tagassign[]; // Array of Tagassign objects
}

interface Tagassign {
    Tag: Tag; // Related Tag object
}

interface Tag {
    tag_id: string;
    tag_name: string;
}

interface PaginationData {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

interface JsonResponse {
    success: boolean;
    message: string;
    paginationData?: any;
    data?: any;
}

// Utils

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const execAsync = promisify(exec);

function getPassedTestCaseList(maxValue: number, decimalNumber: number): number[] {
    const numberArray: number[] = [];
    for (let i = 0; i < maxValue; i++) {
        if (decimalNumber & (1 << i)) {
            numberArray.push(i + 1);
        }
    }
    return numberArray;
}

const insertTags = async (tags: string[], challengeId: string) => {
    tags.forEach(async (tag: string) => {
        const tagFormat = tag.toUpperCase();
        const searchTag = await prisma.Tag.findFirst({
            where: {
                tag_name: tagFormat,
            }
        });

        if (!searchTag) {
            const newTag = await prisma.Tag.create({
                data: {
                    tag_name: tagFormat,
                }
            });
            await prisma.TagAssign.create({
                data: {
                    challenge_id: challengeId,
                    tag_id: newTag.tag_id,
                }
            });
        }
        else {
            const tagId = searchTag.tag_id;
            await prisma.TagAssign.create({
                data: {
                    challenge_id: challengeId,
                    tag_id: tagId,
                }
            });
        }
    });
}

async function executeRunFileCommands(runFilePath: string): Promise<void> {
    try {
        // Resolve the directory of run.txt
        const runDirectory = path.dirname(runFilePath);

        // Read the contents of run.txt
        const runCommands = await fs.promises.readFile(runFilePath, 'utf-8');

        // Split the commands by newline character
        const commands = runCommands.split('\n');

        // Execute each command asynchronously
        for (const command of commands) {
            // Execute the command asynchronously
            try {
                // Change the working directory before executing the command
                const options = { cwd: runDirectory };
                await execAsync(command, options);
            } catch (error) {
                console.error(`Error executing command: ${command}`, error);
                throw new CustomError(`Error executing command: ${command}`);
            }
        }
    } catch (error) {
        console.error('Error executing commands from run.txt:', error);
        throw new CustomError('Error executing commands from run.txt');
    }
}

// Middleware

class CustomError extends Error {
    status: number = 500;
    constructor(message: string) {
        super(message);
    }
}

const customErrorHandler = (err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof CustomError) {
        console.error(`[-] ${err.message}`);
        let response: JsonResponse = {
            success: false,
            message: err.message,
        }
        return res.status(err.status).json(response);
    }
    let jsonResponse: JsonResponse = {
        success: false,
        message: 'Unidentified Error',
    };
    return res.status(500).json(jsonResponse);
}

const authMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const auth = req.get('Authorization');
    if (auth === undefined) {
        throw new CustomError('Unauthorized');
    }

    const response = await fetch('https://api.github.com/user', {
        method: 'GET',
        headers: {
            'Authorization': auth,
        }
    });

    if (!response.ok) {
        throw new CustomError('Failed to fetch user data');
    }
    const githubId = (await response.json()).id;
    const user = await prisma.user.findFirst({
        where: {
            github_id: githubId.toString()
        }
    });
    req.body.userId = user.user_id;
    return next();
}

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 1024 * 1024 * 10, // Limit file size to 10MB
    },
});

const roleMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const user_id = req.body.userId;

    const user = await prisma.user.findFirst({
        where: {
            user_id: user_id,
        },
        include: {
            Role: true,
        },
    });

    if (user.Role.role_name !== 'admin') {
        throw new CustomError('Unauthorized');
    }
    return next();
}

const singleUpload = (req: Request, res: Response, next: Function) => {
    upload.single('file')(req as any, res as any, (err: any) => {
        if (err) {
            throw new CustomError('Failed to upload file');
        }
        next();
    });
};

// Routes and Controllers

app.get('/api/v1/', (req, res) => {
    return res.send('QuanC API Ready!');
});

app.get('/getAccessToken', async (req, res) => {
    const param = '?client_id=' + CLIENT_ID + '&client_secret=' + CLIENT_SECRET + '&code=' + req.query.code;
    await fetch('http://github.com/login/oauth/access_token' + param, {
        method: 'POST',
        headers: {
            'Accept': 'application/json'
        }
    })
        .then((response) => { return response.json() })
        .then((data) => {
            res.json(data);
        })
        .catch((error) => {
            console.error('Error:', error);
        });
});

app.get('/getUserData', async (req, res) => {
    const auth = req.get('Authorization');
    if (auth === undefined) {
        return res.status(401).send('Unauthorized');
    }

    const response = await axios.get('https://api.github.com/user', {
        headers: {
            'Authorization': auth,
        }
    });

    if (response.status == 200) {
        const user = await prisma.user.findFirst({
            where: {
                github_id: response.data.id.toString(),
            },
            include: {
                Role: true,
            },
        });

        if (!user) {
            throw new CustomError('User not found');
        }
        const responseData = response.data;
        responseData.app_data = {
            user_id: user.user_id,
            role: user.Role.role_name,
        }
        const jsronResponse: JsonResponse = {
            success: true,
            message: 'User data fetched successfully',
            data: responseData,
        };
        return res.json(jsronResponse);
    }
    throw new CustomError('Failed to fetch user data');;
});

app.post('/addUser', async (req, res) => {
    const body = req.body;
    const githubId = body.github_id;

    if (!githubId) {
        throw new CustomError('Github ID is required');
    }

    const userRole = await prisma.userRole.findFirst({
        where: {
            role_name: 'user'
        }
    });

    const searchUser = await prisma.user.findFirst({
        where: {
            github_id: githubId,
        }
    });

    if (searchUser) {
        return res.json({
            success: true,
            message: 'User already exists',
        })
    }

    const user = await prisma.user.create({
        data: {
            github_id: githubId,
            role_id: userRole.role_id,
        }
    });

    const jsonResponse: JsonResponse = {
        success: true,
        message: 'User added successfully',
        data: user,
    };
    return res.json(jsonResponse);
});

app.post('/submitChallenge', upload.single('file'), async (req, res) => {
    const title = req.body.title;
    const link = req.body.link;
    const points = parseInt(req.body.points);
    const total_test_cases = parseInt(req.body.total_test_case);
    const tags = req.body.tags;
    const file = req.file;
    let challenge

    if (!title || !link || !points || !total_test_cases || !tags) {
        throw new CustomError('All fields are required');
    }

    if (!Number.isInteger(points) || !Number.isInteger(total_test_cases)) {
        throw new CustomError('Points and total test cases must be integers');
    }

    if (!Array.isArray(tags) || tags[0] == "") {
        throw new CustomError('Tags are required');
    }

    if (!file) {
        throw new CustomError('No file uploaded');
    }

    try {
        challenge = await prisma.Challenge.create({
            data: {
                challenge_title: title,
                repo_link: link,
                points: points,
                total_test_case: total_test_cases,
            }
        });
    }
    catch (err) {
        throw new CustomError('Failed to create challenge');
    }

    const challengeId = challenge.challenge_id;
    insertTags(tags, challengeId);

    if (file.originalname.split('.').pop() !== 'zip') {
        throw new CustomError('Only zip files are allowed');
    }

    const uploadPath = '../quan-c-runner/challenges/';

    // const filePath = path.join(uploadPath, file.originalname);
    const filePath = path.join(uploadPath, `${challengeId}.zip`);

    await fs.promises.writeFile(filePath, file.buffer);

    // const unzipPath = path.join(uploadPath, `${path.basename(file.originalname, '.zip')}`);
    const unzipPath = path.join(uploadPath, `${path.basename(challengeId, '.zip')}`);

    try {
        await new Promise((resolve, reject) => {
            fs.createReadStream(filePath)
                .pipe(unzipper.Extract({ path: unzipPath }))
                .on('close', resolve)
                .on('error', reject);
        });

    }
    catch (err) {
        throw new CustomError('Failed to extract zip file');
    }

    const runFilePath = path.join(unzipPath, 'app', 'run.txt');
    await executeRunFileCommands(runFilePath);

    const jsonResponse: JsonResponse = {
        success: true,
        message: `Challenge submitted successfully on ${filePath}`,
    };

    return res.status(200).json(jsonResponse);
});

app.post('/submitAnswer', authMiddleware, upload.single('file'), async (req, res) => {
    const body = req.body;
    const userId = body.userId;
    const challengeId = body.challengeId;
    const submissionId = uuidv4();
    const file = req.file;
    const challengeData = await prisma.Challenge.findFirst({
        where: {
            challenge_id: challengeId,
        },
    });

    if (!file) {
        throw new CustomError('No file uploaded');
    }

    const fileContent = file.buffer.toString('utf-8');

    const totalTestCase = challengeData.total_test_case;


    // try {'utf8');
    const submitFile = new File([fileContent], 'app - Copy.js', { type: 'text/javascript' });
    let formData = new FormData();
    try {

        formData.append('challenge_id', challengeId || "");
        formData.append('user_id', userId || "");
        formData.append('test_case_total', totalTestCase || 10);
        formData.append('id', submissionId || "");
        formData.append('file', submitFile);
    }
    catch (err) {
        throw new CustomError('Failed to create form data');
    }


    const response = await axios.post(
        `http://localhost:${8080}/create-submission`,
        formData,
        {
            headers: { 'Content-Type': 'multipart/form-data' },
        }
    );

    if (response.status != 200) {
        throw new CustomError('Failed to submit answer');
    }


    for (let i = 0; i < 20; i++) {
        const submissionData = await prisma.Submission.findFirst({
            where: {
                submission_id: submissionId,
            },
        });


        if (submissionData) {
            const challengeData = await prisma.Challenge.findFirst({
                where: {
                    challenge_id: submissionData.challenge_id,
                },
            });

            if (!challengeData) {
                throw new CustomError('Data not found');
            }

            const challenge_test_case: number = challengeData.total_test_case;
            const passed_test_case_list = getPassedTestCaseList(challenge_test_case, submissionData.passed_test_case_value);
            submissionData.passed_test_case = passed_test_case_list;
            const jsonResponse: JsonResponse = {
                success: true,
                message: 'Submission Finished',
                data: submissionData,
            };
            return res.json(jsonResponse);
        }
        await delay(5 * 1000);
    }

    return res.status(200).json({ message: 'Data not found' });
});

app.get('/getSubmissionLog/:submissionId', async (req, res) => {
    const { submissionId } = req.params;
    let logPath: string;
    let log: string;
    try {
        const submission = await prisma.Submission.findFirst({
            where: {
                submission_id: submissionId,
            },
        });

        if (!submission) {
            throw new CustomError('Submission not found');
        }
        const path_hash = submission.log_file_path;
        logPath = `../quan-c-runner/logs/${path_hash}`;
    }
    catch (err) {
        throw new CustomError('Failed to fetch submission log');
    }

    try {
        log = await readFile(logPath, 'utf-8');
    }
    catch (err) {
        throw new CustomError('Failed to read log file');
    }

    if (!log) {
        throw new CustomError('Failed to read log file');
    }

    const jsonResponse: JsonResponse = {
        success: true,
        message: 'Submission log fetched successfully',
        data: log,
    };

    return res.json(jsonResponse);
});

app.post('/getChallenges', authMiddleware, async (req, res) => {
    const body = req.body;
    const page = body.page - 1 || 0;
    const limit = 10;
    const userId = body.userId;
    const filter = body.filter || "";
    const search = body.search || "";
    const lowerInput = search.toLowerCase();
    var gte, lte;
    const difficulty = body.difficulty || "all";
    if (difficulty == "easy") {
        gte = 0;
        lte = 15;
    }
    else if (difficulty == "medium") {
        gte = 16;
        lte = 25;
    }
    else if (difficulty == "hard") {
        gte = 26;
        lte = 50;
    }
    else {
        gte = 0;
        lte = 50;
    }

    if (filter === "completed") {
        const challengesWithSubmissionsForUser = await prisma.challenge.findMany({
            where: {
                AND: [
                    {
                        Submissions: {
                            some: {
                                AND: [
                                    { user_id: userId },
                                    { status: true },
                                ],
                            },
                        },
                    },
                    {
                        OR: [
                            {
                                Tagassign: {
                                    some: {
                                        Tag: {
                                            tag_name: {
                                                contains: lowerInput,
                                            },
                                        },
                                    },
                                },
                            },
                            {
                                challenge_title: {
                                    contains: lowerInput,
                                },
                            },
                        ],
                    },
                    {
                        points: {
                            gte: gte,
                            lte: lte,
                        },
                    },
                ],
            },
            include: {
                Submissions: {
                    where: {
                        user_id: userId,
                        status: true,
                    },
                },
                Tagassign: {
                    include: {
                        Tag: true,
                    },
                },
            },
            skip: page * limit,
            take: limit,
            orderBy: [{ created_at: "asc" }],
        });

        const count = await prisma.challenge.count({
            where: {
                AND: [
                    {
                        Submissions: {
                            some: {
                                AND: [
                                    { user_id: userId },
                                    { status: true },
                                ],
                            },
                        },
                    },
                    {
                        OR: [
                            {
                                Tagassign: {
                                    some: {
                                        Tag: {
                                            tag_name: {
                                                contains: lowerInput,
                                            },
                                        },
                                    },
                                },
                            },
                            {
                                challenge_title: {
                                    contains: lowerInput,
                                },
                            },
                        ],
                    },
                    {
                        points: {
                            gte: gte,
                            lte: lte,
                        },
                    },
                ],
            },
        });

        const result = challengesWithSubmissionsForUser.map((challenge: Challenge) => ({
            challenge_id: challenge.challenge_id,
            challenge_title: challenge.challenge_title,
            repo_link: challenge.repo_link.substring(19),
            points: challenge.points,
            total_test_Case: challenge.total_test_case,
            tags: challenge.Tagassign.slice(0, 3).map((tagAssign) => ({ // Limit to first 3 tags
                tag_id: tagAssign.Tag.tag_id,
                tag_name: tagAssign.Tag.tag_name.toLowerCase(),
            })),
        }));

        const paginationData: PaginationData = {
            page: page + 1,
            limit: limit,
            total: count,
            totalPages: Math.ceil(count / limit),
        };

        const jsonResponse: JsonResponse = {
            success: true,
            message: 'Challenges fetched successfully',
            paginationData: paginationData,
            data: result,
        };
        return res.json(jsonResponse);
    }

    const challengesWithNoTrueSubmissions = await prisma.challenge.findMany({
        where: {
            NOT: {
                Submissions: {
                    some: {
                        AND: [
                            { user_id: userId },
                            { status: true },
                        ],
                    },
                },
            },
            OR: [
                {
                    Tagassign: {
                        some: {
                            Tag: {
                                tag_name: {
                                    contains: lowerInput,
                                },
                            },
                        },
                    },
                },
                {
                    challenge_title: {
                        contains: lowerInput,
                    },
                },
            ],
            points: {
                gte: gte,
                lte: lte,
            },
        },
        include: {
            Submissions: {
                where: {
                    user_id: userId,
                },
            },
            Tagassign: {
                include: {
                    Tag: true,
                },
            },
        },
        skip: page * limit,
        take: limit,
        orderBy: [{ created_at: "asc" }],
    });

    const count = await prisma.challenge.count({
        where: {
            NOT: {
                Submissions: {
                    some: {
                        AND: [
                            { user_id: userId },
                            { status: true },
                        ],
                    },
                },
            },
            OR: [
                {
                    Tagassign: {
                        some: {
                            Tag: {
                                tag_name: {
                                    contains: lowerInput,
                                },
                            },
                        },
                    },
                },
                {
                    challenge_title: {
                        contains: lowerInput,
                    },
                },
            ],
            points: {
                gte: gte,
                lte: lte,
            },
        },
    });


    const result = challengesWithNoTrueSubmissions.map((challenge: Challenge) => ({
        challenge_id: challenge.challenge_id,
        challenge_title: challenge.challenge_title,
        repo_link: challenge.repo_link.substring(19),
        points: challenge.points,
        total_test_Case: challenge.total_test_case,
        tags: challenge.Tagassign.slice(0, 3).map((tagAssign) => ({ // Limit to first 3 tags
            tag_id: tagAssign.Tag.tag_id,
            tag_name: tagAssign.Tag.tag_name.toLowerCase(),
        })),
    }));

    const paginationData: PaginationData = {
        page: page + 1,
        limit: limit,
        total: count,
        totalPages: Math.ceil(count / limit),
    };

    const jsonResponse: JsonResponse = {
        success: true,
        message: 'Challenges fetched successfully',
        paginationData: paginationData,
        data: result,
    };
    return res.json(jsonResponse);
});

// Runner

app.use(customErrorHandler);

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});