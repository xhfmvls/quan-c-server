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

    // Inserting another challenge
    await prisma.challenge.create({
        data: {
            challenge_title: 'Sequel PHP Injection',
            repo_link: 'https://github.com/xhfmvls/Sequel-PHP-Injection',
            points: 10,
            total_test_case: 10
        }
    });

    // Inserting a submission

    const thatOneUser = await prisma.user.findFirst({
        where: {
            github_id: '77483582' // Assuming '77483582' is the GitHub ID of the admin user
        }
    });

    if (!thatOneUser) {
        throw new Error("Admin user not found");
    }

    // Get the challenge_id of the 'PathGuard' challenge
    const pathGuardChallenge = await prisma.challenge.findFirst({
        where: {
            challenge_title: 'PathGuard'
        }
    });

    if (!pathGuardChallenge) {
        throw new Error("PathGuard challenge not found");
    }

    // Create submission using the retrieved user_id and challenge_id
    await prisma.submission.create({
        data: {
            user_id: thatOneUser.user_id,
            challenge_id: pathGuardChallenge.challenge_id,
            status: true,
            passed_test_case_value: 1023
        }
    });

    const thatOneUserWhoFailed = await prisma.user.findFirst({
        where: {
            github_id: '109542977' // Assuming '109542977' is the GitHub ID of the admin user
        }
    });

    if (!thatOneUserWhoFailed) {
        throw new Error("Admin user not found");
    }


    await prisma.submission.create({
        data: {
            user_id: thatOneUserWhoFailed.user_id,
            challenge_id: pathGuardChallenge.challenge_id,
            status: false,
            passed_test_case_value: 47
        }
    });

    const newChallange = await prisma.challenge.findFirst({
        where: {
            challenge_title: 'Sequel PHP Injection'
        }
    });

    await prisma.submission.create({
        data: {
            user_id: thatOneUser.user_id,
            challenge_id: newChallange.challenge_id,
            status: false,
            passed_test_case_value: 7
        }
    });

       await prisma.challenge.create({
        data: {
            challenge_title: 'Sequel Express Injection',
            repo_link: 'https://github.com/xhfmvls/Sequel-Express-Injection',
            points: 15,
            total_test_case: 15
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
