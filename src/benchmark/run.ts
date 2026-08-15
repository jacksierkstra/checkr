// benchmark/validateBooksBenchmark.ts
import fs from 'fs';
import path from 'path';
import { compileSchema, validate } from '@lib/core/compiled';
import { runWithResourceUsage } from '@benchmark/utils';

const schemaPath = path.join(__dirname, 'fixtures', 'books.xsd');
const xmlPath = path.join(__dirname, 'fixtures', 'books.xml');

const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
const testXml = fs.readFileSync(xmlPath, 'utf-8');

// Two-phase API (CHK-008/009): compile the schema once, then validate many
// instances against the immutable CompiledSchema — the pattern the XSTS
// runner will use (compile once, validate a corpus).
const ITERATIONS = 1000;
const schema = compileSchema(schemaContent);

const validateBooks = async () => {
    for (let i = 0; i < ITERATIONS; i++) {
        const result = validate(testXml, schema);
        if (!result.valid) {
            throw new Error(`benchmark fixture failed to validate: ${result.errors[0]?.message}`);
        }
    }
};

runWithResourceUsage(`Validate Books XML × ${ITERATIONS} (two-phase API)`, validateBooks).catch(console.error);
