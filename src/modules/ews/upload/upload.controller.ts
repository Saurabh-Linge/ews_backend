import { Controller, Post, Get, Param, Req, Res } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import { pipeline } from 'stream';

const pump = util.promisify(pipeline);

@Controller('ews/upload')
export class UploadController {
  @Post()
  async uploadFile(@Req() req: any, @Res() res: any) {
    if (!req.isMultipart()) {
      return res.status(400).send({ message: 'Request is not multipart' });
    }

    const parts = req.files();
    const uploaded = [];
    const dir = path.join(process.cwd(), 'uploads', 'evidence');

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    try {
      for await (const part of parts) {
        // Sanitize filename and add timestamp to avoid collisions
        const safeName = part.filename.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const filename = `${Date.now()}-${safeName}`;
        const saveTo = path.join(dir, filename);

        await pump(part.file, fs.createWriteStream(saveTo));
        uploaded.push({ original_name: part.filename, saved_name: filename });
      }
      return res.send(uploaded);
    } catch (err) {
      return res
        .status(500)
        .send({ message: 'Failed to upload files', error: err.message });
    }
  }

  @Get(':filename')
  async getFile(@Param('filename') filename: string, @Res() res: any) {
    const safeName = filename.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const filePath = path.join(process.cwd(), 'uploads', 'evidence', safeName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send({ message: 'File not found' });
    }

    const stream = fs.createReadStream(filePath);

    // Simple MIME type guessing
    let contentType = 'application/octet-stream';
    if (safeName.endsWith('.pdf')) contentType = 'application/pdf';
    else if (safeName.endsWith('.png')) contentType = 'image/png';
    else if (safeName.endsWith('.jpg') || safeName.endsWith('.jpeg'))
      contentType = 'image/jpeg';

    // Set headers for inline display or download depending on type
    const disposition =
      contentType.startsWith('image') || contentType === 'application/pdf'
        ? 'inline'
        : 'attachment';

    res.header('Content-Disposition', `${disposition}; filename="${safeName}"`);
    res.type(contentType);
    return res.send(stream);
  }
}
