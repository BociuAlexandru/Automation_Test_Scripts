#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function main() {
    const failuresDir = path.join(process.cwd(), 'failures');

    if (!fs.existsSync(failuresDir)) {
        console.log('No "failures" directory found. Nothing to delete.');
        return;
    }

    const dirEntries = await fs.promises.readdir(failuresDir, { withFileTypes: true });
    const csvFiles = dirEntries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.csv'));

    if (csvFiles.length === 0) {
        console.log('No CSV files found in "failures" directory.');
        return;
    }

    for (const file of csvFiles) {
        const filePath = path.join(failuresDir, file.name);
        await fs.promises.unlink(filePath);
        console.log(`Deleted ${file.name}`);
    }

    console.log(`Deleted ${csvFiles.length} file(s).`);
}

main().catch((error) => {
    console.error('Failed to clean failures directory:', error);
    process.exitCode = 1;
});
