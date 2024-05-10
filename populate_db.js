const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
    // Inserting roles
    await prisma.userRole.createMany({
        data: [
            { role_name: 'user' },
            { role_name: 'admin' }
        ]
    });

    // Retrieving the role_id for the 'admin' role
    const adminRole = await prisma.userRole.findFirst({
        where: {
            role_name: 'admin'
        }
    });

    // Retrieving the role_id for the 'user' role'
    const userRole = await prisma.userRole.findFirst({
        where: {
            role_name: 'user'
        }
    });

    if (!adminRole) {
        throw new Error("Admin role not found");
    }

    if (!userRole) {
        throw new Error("User role not found");
    }

    // Inserting the admin user
    await prisma.user.createMany({
        data: [
            {
                role_id: adminRole.role_id,
                github_id: '77483582',
            },
            {
                role_id: userRole.role_id,
                github_id: '109542977',
            },
            {
                role_id: userRole.role_id,
                github_id: '94731863',
            }
        ]
    });

    // Inserting a challenge
    await prisma.challenge.create({
        data: {
            challenge_title: 'PathGuard',
            repo_link: 'https://github.com/xhfmvls/PathGuard',
            points: 10,
            total_test_case: 10
        }
    });
}

main()
    .catch(e => {
        throw e;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
