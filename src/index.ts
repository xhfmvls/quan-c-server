// src/index.ts
import express from 'express';
import dotenv from 'dotenv';
const { PrismaClient } = require('@prisma/client');
require('express-async-errors');

dotenv.config();
const app = express();
const port = 8000;
const prisma = new PrismaClient();

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
    const challanges = await prisma.challenge.findMany();
    return res.json(challanges);
});

// Runner

app.use(customErrorHandler);

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});