import { exec } from 'child_process';
import { promisify } from 'util';
import CustomError from './error.utils';
import { open, Entry } from 'yauzl';
import fs, { createWriteStream, mkdir, readFileSync } from 'fs';
import path, { dirname, join } from 'path';
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const execAsync = promisify(exec);

const addUser = (githubId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!githubId) {
        return reject(new CustomError('Github ID is required'));
      }
  
      prisma.userRole.findFirst({
        where: {
          role_name: 'user'
        }
      }).then((userRole: { role_id: any; }) => {
        if (!userRole) {
          throw new CustomError('User role not found');
        }
  
        return prisma.user.findFirst({
          where: {
            github_id: githubId,
          }
        }).then((searchUser: any) => {
          if (searchUser) {
            return resolve(); // User already exists, resolve without creating
          }
  
          return prisma.user.create({
            data: {
              github_id: githubId,
              role_id: userRole.role_id,
            }
          }).then((user: any) => {
            resolve();
          });
        });
      }).catch((error: any) => {
        reject(error);
      });
    });
  }

function getPassedTestCaseList(maxValue: number, decimalNumber: number): number[] {
    const numberArray: number[] = [];
    for (let i = 0; i < maxValue; i++) {
        if (decimalNumber & (1 << i)) {
            numberArray.push(i + 1);
        }
    }
    return numberArray;
}

const insertTags = async (tags: string[], challengeId: string) => {
    tags.forEach(async (tag: string) => {
        const tagFormat = tag.toUpperCase();
        const searchTag = await prisma.Tag.findFirst({
            where: {
                tag_name: tagFormat,
            }
        });

        if (!searchTag) {
            const newTag = await prisma.Tag.create({
                data: {
                    tag_name: tagFormat,
                }
            });
            await prisma.TagAssign.create({
                data: {
                    challenge_id: challengeId,
                    tag_id: newTag.tag_id,
                }
            });
        }
        else {
            const tagId = searchTag.tag_id;
            await prisma.TagAssign.create({
                data: {
                    challenge_id: challengeId,
                    tag_id: tagId,
                }
            });
        }
    });
}

function extractZip(filePath: string, unzipPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        open(filePath, { lazyEntries: true }, (err, zipfile) => {
            if (err) return reject(new CustomError('Failed to open zip file'));

            zipfile.on('entry', (entry: Entry) => {
                const fileName: string = entry.fileName;
                const entryPath: string = join(unzipPath, fileName);

                if (/\/$/.test(fileName)) {
                    // Directory entry
                    mkdir(entryPath, { recursive: true }, (err) => {
                        if (err) return reject(new CustomError('Failed to create directory'));
                        zipfile.readEntry();
                    });
                } else {
                    // File entry
                    const dirPath: string = dirname(entryPath);
                    mkdir(dirPath, { recursive: true }, (err) => {
                        if (err) return reject(new CustomError('Failed to create directory'));

                        zipfile.openReadStream(entry, (err, readStream) => {
                            if (err) return reject(new CustomError('Failed to read zip entry'));

                            const writeStream = createWriteStream(entryPath);
                            readStream.pipe(writeStream);

                            readStream.on('end', () => {
                                zipfile.readEntry();
                            });

                            writeStream.on('error', () => {
                                return reject(new CustomError('Failed to write file'));
                            });
                        });
                    });
                }
            });

            zipfile.on('end', resolve);
            zipfile.on('error', () => reject(new CustomError('Failed during zip extraction')));
            zipfile.readEntry();
        });
    });
}



async function executeRunFileCommands(runFilePath: string): Promise<void> {
    try {
        // Resolve the directory of run.txt
        const runDirectory = path.dirname(runFilePath);

        // Read the contents of run.txt
        const runCommands = await fs.promises.readFile(runFilePath, 'utf-8');

        // Split the commands by newline character
        const commands = runCommands.split('\n');

        // Execute each command asynchronously
        for (const command of commands) {
            // Execute the command asynchronously
            try {
                // Change the working directory before executing the command
                const options = { cwd: runDirectory };
                await execAsync(command, options);
            } catch (error) {
                console.error(`Error executing command: ${command}`, error);
                throw new CustomError(`Error executing command: ${command}`);
            }
        }
    } catch (error) {
        console.error('Error executing commands from run.txt:', error);
        throw new CustomError('Error executing commands from run.txt');
    }
}

export {
    delay,
    execAsync,
    addUser,
    getPassedTestCaseList,
    insertTags,
    extractZip,
    executeRunFileCommands
}