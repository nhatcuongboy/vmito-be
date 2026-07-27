/**
 * Writes the OpenAPI document to a file, for the Flutter client's DTO codegen.
 *
 *   npm run openapi:export             # -> openapi.json
 *   npm run openapi:export -- path.json
 *
 * Runs in Nest **preview mode**, so no provider is instantiated: the module
 * graph is built and its metadata read, but `onModuleInit` never fires. That
 * matters because `PrismaService.onModuleInit` opens a database connection —
 * without preview mode this script could not run in CI without a live
 * database. The document depends only on decorator metadata, so skipping
 * instantiation costs nothing.
 *
 * The output is only as good as the `@nestjs/swagger` CLI plugin configured in
 * `nest-cli.json`. Disable it and most DTOs export as `{}`.
 */
import { writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { mkdirSync } from 'fs';

import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from '../src/app.module';
import { buildSwaggerConfig } from '../src/swagger.config';

/**
 * Renames the `Object` schema, which Dart codegen cannot tolerate.
 *
 * The Swagger CLI plugin emits `$ref: '#/components/schemas/Object'` for any
 * parameter whose type it cannot resolve. In this project that is every query
 * parameter typed with a Prisma enum: Prisma generates those as a const object
 * plus a type alias rather than a TypeScript enum, and the plugin cannot read
 * them. It affects ~7 query parameters (`type`, `status`, `matchType`,
 * `sportType`, `customerType`, `page`, `limit`).
 *
 * The resulting schema is `{type: 'object', properties: {}}` — no information —
 * but its *name* is the problem: `swagger_dart_code_generator` turns every
 * schema into a Dart class, and a class named `Object` shadows `dart:core`'s
 * inside the generated library. That breaks every `operator ==(Object other)`
 * override: 1,979 analyzer errors, none of them fixable downstream.
 *
 * No schema under `components` references it — only path parameters do — so
 * renaming is safe and keeps every `$ref` resolvable.
 *
 * The real fix belongs in the DTOs: `@ApiProperty({ enum: FeedbackType })` on
 * each Prisma-enum field would give these parameters proper types. Until then
 * the parameters are untyped in the contract, and any client reading them must
 * take the type from the TypeScript source.
 */
function renameObjectSchema(document: {
  components?: { schemas?: Record<string, unknown> };
}): void {
  const schemas = document.components?.schemas;
  if (!schemas?.Object) return;

  const replacement = 'UntypedParameterValue';
  schemas[replacement] = schemas.Object;
  delete schemas.Object;

  const patched = JSON.stringify(document).replaceAll(
    '"#/components/schemas/Object"',
    `"#/components/schemas/${replacement}"`
  );
  Object.assign(document, JSON.parse(patched));
}

async function exportDocument(): Promise<void> {
  const outputPath = resolve(process.argv[2] ?? 'openapi.json');

  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });

  // Mirrors main.ts. Without it every path in the document loses its `/api`
  // prefix and the generated client calls the wrong URLs.
  app.setGlobalPrefix('api', {
    exclude: ['/', 'health', 'health/live', 'health/ready'],
  });

  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  await app.close();

  renameObjectSchema(document);

  const pathCount = Object.keys(document.paths ?? {}).length;
  const schemas = document.components?.schemas ?? {};
  const schemaCount = Object.keys(schemas).length;
  const propertyCount = Object.values(schemas).reduce<number>(
    (total, schema) =>
      total + Object.keys((schema as { properties?: object }).properties ?? {})
        .length,
    0
  );

  // Guard against a document produced without the CLI plugin — for example by
  // running this file through ts-node, which does not apply `nest build`
  // transformers. Such a document still has paths and schema *names*, so it
  // looks plausible; the DTOs inside are simply empty, and the Dart classes
  // generated from it would be empty too. That failure would surface only once
  // someone tried to read a field, far from the cause.
  //
  // Measured on this project: with the plugin, 1 of 158 schemas has no
  // properties (`Object`, legitimately). Without it, 104 of 133 — 78%. A 10%
  // threshold sits far from both.
  const emptySchemas = Object.entries(schemas).filter(([, schema]) => {
    const candidate = schema as { properties?: object; enum?: unknown[] };
    // `properties: {}` is what a plugin-less DTO looks like, and an empty
    // object is truthy — count keys, do not test the object itself.
    const hasProperties = Object.keys(candidate.properties ?? {}).length > 0;
    const hasEnum = (candidate.enum ?? []).length > 0;
    return !hasProperties && !hasEnum;
  });

  if (schemaCount > 0 && emptySchemas.length > schemaCount * 0.1) {
    throw new Error(
      `${emptySchemas.length} of ${schemaCount} schemas have no properties ` +
        `(e.g. ${emptySchemas
          .slice(0, 3)
          .map(([name]) => name)
          .join(', ')}). The @nestjs/swagger CLI plugin in nest-cli.json was ` +
        'not applied — run this via `npm run openapi:export`, which builds ' +
        'first. Refusing to write a document that would generate empty DTOs.'
    );
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`);

  console.log(
    `Wrote ${outputPath} — ${pathCount} paths, ${schemaCount} schemas, ` +
      `${propertyCount} properties.`
  );
}

exportDocument().catch((error: unknown) => {
  console.error('Failed to export OpenAPI document:', error);
  process.exit(1);
});
