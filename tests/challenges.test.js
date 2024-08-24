const request = require("supertest");
const { app, server } = require('../dist/index');
const path = require('path');
const sampleUserId = 'a9b4582d-5f95-4187-b399-15af0ea1f482';
const authToken = 'Bearer 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';

describe("Challenges Controller", () => {

    //   describe("submitChallege", () => {
    //     it("should return 200 and success message when challenge is submitted successfully", async () => {
    //       const response = await request(app)
    //         .post("/submitChallenge") // Updated to match your route
    //         .set("Authorization", "Bearer yourToken") // Include any necessary headers
    //         .attach("file", path.join(__dirname, "sample.zip")) // Adjust to the correct path for your test file
    //         .field("title", "Sample Challenge")
    //         .field("link", "http://example.com")
    //         .field("points", 10)
    //         .field("total_test_case", 5)
    //         .field("tags", ["tag1", "tag2"]);

    //       expect(response.status).toBe(200);
    //       expect(response.body.success).toBe(true);
    //       expect(response.body.message).toContain("Challenge submitted successfully");
    //     });

    //     it("should return 400 if any required fields are missing", async () => {
    //       const response = await request(app)
    //         .post("/submitChallenge")
    //         .set("Authorization", "Bearer yourToken")
    //         .attach("file", path.join(__dirname, "sample.zip"))
    //         .field("title", "Sample Challenge")
    //         .field("points", 10)
    //         .field("total_test_case", 5)
    //         .field("tags", ["tag1", "tag2"]);

    //       expect(response.status).toBe(400);
    //       expect(response.body).toHaveProperty("error");
    //       expect(response.body.error).toEqual("All fields are required");
    //     });

    //     it("should return 400 if file is not a zip", async () => {
    //       const response = await request(app)
    //         .post("/submitChallenge")
    //         .set("Authorization", "Bearer yourToken")
    //         .attach("file", path.join(__dirname, "sample.txt")) // Test with a non-zip file
    //         .field("title", "Sample Challenge")
    //         .field("link", "http://example.com")
    //         .field("points", 10)
    //         .field("total_test_case", 5)
    //         .field("tags", ["tag1", "tag2"]);

    //       expect(response.status).toBe(400);
    //       expect(response.body).toHaveProperty("error");
    //       expect(response.body.error).toEqual("Only zip files are allowed");
    //     });

    //     it("should return 400 if no file is uploaded", async () => {
    //       const response = await request(app)
    //         .post("/submitChallenge")
    //         .set("Authorization", "Bearer yourToken")
    //         .field("title", "Sample Challenge")
    //         .field("link", "http://example.com")
    //         .field("points", 10)
    //         .field("total_test_case", 5)
    //         .field("tags", ["tag1", "tag2"]);

    //       expect(response.status).toBe(400);
    //       expect(response.body).toHaveProperty("error");
    //       expect(response.body.error).toEqual("No file uploaded");
    //     });
    //   });

    describe("getChallenges", () => {
        it("should return 200 and the incomplete challenges'", async () => {
            const response = await request(app)
                .post("/getChallenges") // Updated to match your route
                .set("Authorization", authToken)
                .send({
                    userId: sampleUserId,
                    filter: "incomplete",
                    page: 1,
                    search: "",
                    difficulty: "all",
                });

            console.log(response.body);
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty("data");
            expect(response.body.message).toEqual("Challenges fetched successfully");
        });

        it("should return 200 and the completed medium challenges with 'sql' in the title", async () => {
            const response = await request(app)
                .post("/getChallenges")
                .set("Authorization", authToken)
                .send({
                    userId: sampleUserId,
                    filter: "completed",
                    page: 1,
                    search: "sql",
                    difficulty: "easy",
                });

            console.log(response.body);
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty("data");
            expect(response.body.message).toEqual("Challenges fetched successfully");
        });

        it("should return an empty list when there are no challenges matching the criteria", async () => {
            const response = await request(app)
                .post("/getChallenges")
                .set("Authorization", authToken)
                .send({
                    userId: sampleUserId,
                    filter: "completed",
                    page: 1,
                    search: "nonexistent",
                    difficulty: "easy",
                });

            console.log(response.body);
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual([]);
            expect(response.body.message).toEqual("Challenges fetched successfully");
        });

        it("should return error if the token is invalid", async () => {
            const invalidToken = "Bearer gho_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

            const response = await request(app)
                .post("/getChallenges")
                .set("Authorization", invalidToken)
                .send({
                    userId: sampleUserId,
                    filter: "completed",
                    page: 1,
                    search: "",
                    difficulty: "all",
                });

            console.log(response.body);
            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
        });
    });
});

afterAll((done) => {
    server.close(done);
});