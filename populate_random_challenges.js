function getRandomTitle(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
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

const main = async () => {
    for (var i = 0; i < 113; i++) {
        var title = getRandomTitle(10);
        points = getRandomPoints(10, 25);
        data = {
            challenge_title: title,
            repo_link: `https://github.com/xhfmvls/${title}`,
            points: points,
            total_test_case: 17
        }

        // await prisma.challenge.create(data);
        console.log(data)
    }
}

main()