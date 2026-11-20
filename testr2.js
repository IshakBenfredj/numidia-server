import dotenv from "dotenv";
dotenv.config();
import {
    S3Client,
    ListBucketsCommand
} from "@aws-sdk/client-s3";


console.log("Endpoint:", process.env.R2_ENDPOINT);
console.log("Bucket:", process.env.R2_BUCKET_NAME);
console.log("Key ID:", process.env.AWS_ACCESS_KEY_ID);
console.log("Secret exists:", !!process.env.AWS_SECRET_ACCESS_KEY);

const s3 = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const buckets = await s3.send(new ListBucketsCommand({}));

console.log(buckets);