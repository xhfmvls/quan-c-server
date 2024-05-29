// src/index.ts
import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import cors from 'cors';
import axios from 'axios';
import multer from 'multer';
// import FormData from 'form-data';
import { v4 as uuidv4 } from 'uuid';
import { Readable, Writable } from 'stream';
import fs, { readFileSync } from 'fs';
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
    await fetch('https://api.github.com/user', {
        method: 'GET',
        headers: {
            'Authorization': auth,
        }
    })
        .then((response) => {
            return response.json();
        })
        .then((data) => {
            res.json(data);
        })
        .catch((error) => {
            console.error('Error:', error);
        });
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
        console.log(err);
        throw new CustomError('Failed to create form data');
    }


    const response = await axios.post(
        `http://localhost:${8080}/create-submission`,
        formData,
        {
            headers: { 'Content-Type': 'multipart/form-data' },
        }
    );

    if (response.status == 200) {
        return res.json({
            success: true,
            message: 'Answer submitted',
        });
    }
    else {
        throw new CustomError('Failed to submit answer');
    }
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