import { readFile, writeFile } from 'node:fs/promises';

const [javascript, stylesheet] = await Promise.all([
  readFile(new URL('../dist/portal.js', import.meta.url), 'utf8'),
  readFile(new URL('../dist/portal.css', import.meta.url), 'utf8'),
]);

const html = `<!doctype html>
<html lang="en">
  <head>
    <base target="_top">
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#102d58">
    <title>NTCCSL Finance System</title>
    <style>${stylesheet}</style>
  </head>
  <body>
    <div id="root"></div>
    <script>${javascript}</script>
  </body>
</html>
`;

await writeFile(new URL('../Admin.html', import.meta.url), html);
console.log('Built Admin.html for the Apps Script panel route.');
