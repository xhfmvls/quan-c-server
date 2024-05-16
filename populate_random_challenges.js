const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function getRandomTitle(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxy';
    let result = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        result += characters[randomIndex];
    }
    return result;
}

function getRandomPoints(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
    var sum = []
    for (var i = 0; i < 113; i++) {
        var title = getRandomTitle(12);
        points = getRandomPoints(10, 25);
        data = {
            challenge_title: title,
            repo_link: `https://github.com/xhfmvls/${title}`,
            points: points,
            total_test_case: 17
        }

        sum.push(data)
    }
    await prisma.challenge.createMany({
        data: sum
    });
}

main()