-- CreateTable
CREATE TABLE "Submission" (
    "id" SERIAL NOT NULL,
    "aadhaar" VARCHAR(20),
    "pan" VARCHAR(20),
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);
