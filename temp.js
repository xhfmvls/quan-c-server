const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const deleteRecentSubmissions = async () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const deleteResponse = await prisma.submission.deleteMany({
        where: {
            created_at: {
                gte: fiveMinutesAgo,
            },
        },
    });

    console.log(`${deleteResponse.count} submissions deleted.`);
};

const test = async () => {
    // await deleteRecentSubmissions();
    const response = await prisma.submission.findMany();
    console.log(response.length);
    console.log(response);
}

const main = async () => {
    await test();
}

main();