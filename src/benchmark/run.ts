// benchmark/validateBooksBenchmark.ts
import fs from 'fs';
import path from 'path';
import { Checkr } from '@lib/core/main';
import { runWithResourceUsage } from '@benchmark/utils';

const schemaPath = path.join(__dirname, 'fixtures', 'books.xsd');
const xmlPath = path.join(__dirname, 'fixtures', 'books.xml');

const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
const testXml = fs.readFileSync(xmlPath, 'utf-8');

const validateBooks = async () => {
    const validator = new Checkr();
    await validator.validate(testXml, schemaContent);
};

// Run with resource tracking
runWithResourceUsage('Validate Books XML', validateBooks).catch(console.error);
