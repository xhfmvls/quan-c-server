const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function getRandomTags(tagIds, min = 1, max = 6) {
    const numTags = Math.floor(Math.random() * (max - min + 1)) + min;
    const shuffledTags = tagIds.sort(() => 0.5 - Math.random());
    return shuffledTags.slice(0, numTags);
}

async function searchChallenges(input) {
    // Convert input to lower case
    const lowerInput = input.toLowerCase();

    const challenges = await prisma.challenge.findMany({
        where: {
            OR: [
                {
                    Tagassign: {
                        some: {
                            Tag: {
                                tag_name: {
                                    contains: lowerInput
                                }
                            }
                        }
                    }
                },
                {
                    challenge_title: {
                        contains: lowerInput
                    }
                }
            ]
        },
        include: {
            Tagassign: {
                include: {
                    Tag: true
                }
            }
        }
    });

    // Convert results to lower case for comparison
    const result = challenges.map(challenge => ({
        challenge_id: challenge.challenge_id,
        challenge_title: challenge.challenge_title,
        tags: challenge.Tagassign.map(tagAssign => ({
            tag_id: tagAssign.Tag.tag_id,
            tag_name: tagAssign.Tag.tag_name.toLowerCase()
        }))
    }));

    console.log(JSON.stringify(result, null, 2));
}


async function getChallengesAndTags() {
    const challenges = await prisma.challenge.findMany({
        include: {
            Tagassign: {
                include: {
                    Tag: true
                }
            }
        }
    });

    const mapChallenges = challenges.map(challenge => {
        const tags = challenge.Tagassign.map(tagAssign => ({
            tag_id: tagAssign.Tag.tag_id,
            tag_name: tagAssign.Tag.tag_name
        }));

        // Ensure exactly three tags are assigned
        const selectedTags = tags.slice(0, 3);

        return {
            challenge_id: challenge.challenge_id,
            challenge_title: challenge.challenge_title,
            tags: selectedTags
        };
    });

    console.log(JSON.stringify(mapChallenges, null, 2));
}

async function main() {
    await prisma.tag.createMany({
        data: [
            { tag_name: 'python' },
            { tag_name: 'js' },
            { tag_name: 'java' },
            { tag_name: 'php' },
            { tag_name: 'javascript' },
            { tag_name: 'sqlinjection' },
            { tag_name: 'xss' },
            { tag_name: 'idor' },
            { tag_name: 'lfi' },
            { tag_name: 'rce' }, // Remote Code Execution
            { tag_name: 'csrf' }, // Cross-Site Request Forgery
            { tag_name: 'ssti' }, // Server-Side Template Injection
            { tag_name: 'mysql' },
            { tag_name: 'auth' }, // Authentication
            { tag_name: 'oauth' },
            { tag_name: 'sso' }, // Single Sign-On
            { tag_name: 'jwt' }, // JSON Web Token
            { tag_name: 'encryption' },
            { tag_name: 'api' }
        ]
    });

    const challenges = await prisma.challenge.findMany({
        select: {
            challenge_id: true
        }
    });
    const challengeIds = challenges.map(challenge => challenge.challenge_id);

    // Fetch tag IDs from the database
    const tags = await prisma.tag.findMany({
        select: {
            tag_id: true
        }
    });
    const tagIds = tags.map(tag => tag.tag_id);

    for (const challengeId of challengeIds) {
        const selectedTags = await getRandomTags(tagIds);
        for (const tagId of selectedTags) {
            await prisma.tagAssign.create({
                data: {
                    challenge_id: challengeId,
                    tag_id: tagId
                }
            });
        }
    }
}

// main()