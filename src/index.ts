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

interface JsonResponse {
    success: boolean;
    message: string;
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

app.get('/getChallenges', authMiddleware, async (req, res) => {
    const body = req.body;
    const page = body.page - 1 || 0;
    const limit = 10;

    if (body !== undefined) {
        const filter = body.filter || "all";
        const userId = body.userId;
        if (filter === "completed") {
            const challengesWithSubmissionsForUser = await prisma.challenge.findMany({
                where: {
                    Submissions: {
                        some: {
                            AND: [
                                { user_id: userId }, // Filter submissions where the user_id is equal to the specified value
                                { status: true } // Filter submissions where status is true
                            ]
                        }
                    }
                },
                include: {
                    Submissions: {
                        where: {
                            AND: [
                                { user_id: userId }, // Filter submissions where the user_id is equal to the specified value
                                { status: true } // Filter submissions where status is true
                            ]
                        }
                    }
                },
                skip: page * limit,
                take: limit,
                orderBy: [{
                    created_at: 'asc',
                }]
            });
            const jsonResponse: JsonResponse = {
                success: true,
                message: 'Challenges fetched successfully',
                data: challengesWithSubmissionsForUser,
            };
            return res.json(jsonResponse);
        }
        if (filter === "incomplete") {
            const challengesWithNoTrueSubmissions = await prisma.challenge.findMany({
                where: {
                    Submissions: {
                        none: {
                            status: true // Filter submissions where status is true
                        }
                    }
                },
                skip: page * limit,
                take: limit,
                orderBy: [{
                    created_at: 'asc',
                }]
            });
            const jsonResponse: JsonResponse = {
                success: true,
                message: 'Challenges fetched successfully',
                data: challengesWithNoTrueSubmissions,
            };
            return res.json(jsonResponse);
        }
    }

    const challanges = await prisma.challenge.findMany({
        skip: page * limit,
        take: limit,
        orderBy: [{
            created_at: 'asc',
        }]
    });
    const jsonResponse: JsonResponse = {
        success: true,
        message: 'Challenges fetched successfully',
        data: challanges,
    };
    return res.json(jsonResponse);
});

// Runner

app.use(customErrorHandler);

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});