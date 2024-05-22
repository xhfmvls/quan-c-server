// src/index.ts
import express from 'express';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import cors from 'cors';
const { PrismaClient } = require('@prisma/client');
require('express-async-errors');

dotenv.config();
const app = express();
const port = 8000;
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

export default CustomError;

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

app.post('/getChallenges', authMiddleware, async (req, res) => {
    const body = req.body;
    const page = body.page - 1 || 0;
    const limit = 10;
    const userId = body.userId;
    const filter = body.filter || "";
    const search = body.search || "";
    const lowerInput = search.toLowerCase();

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
                                // Search by tags
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
                                // Search by challenge title
                                challenge_title: {
                                    contains: lowerInput,
                                },
                            },
                        ],
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
                                // Search by tags
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
                                // Search by challenge title
                                challenge_title: {
                                    contains: lowerInput,
                                },
                            },
                        ],
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
                    // Search by tags
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
                    // Search by challenge title
                    challenge_title: {
                        contains: lowerInput,
                    },
                },
            ],
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
                    // Search by tags
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
                    // Search by challenge title
                    challenge_title: {
                        contains: lowerInput,
                    },
                },
            ],
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