ALTER TABLE "User" ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "JellyfinProfile" (
  "userId" TEXT NOT NULL,
  "jellyfinUserId" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JellyfinProfile_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "JellyfinProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
