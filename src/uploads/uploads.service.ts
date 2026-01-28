import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class UploadsService {
  private readonly uploadsDir = path.join(process.cwd(), 'uploads');

  constructor() {
    // Ensure upload directories exist
    this.ensureDir(path.join(this.uploadsDir, 'qr-codes'));
    this.ensureDir(path.join(this.uploadsDir, 'payment-proofs'));
  }

  private ensureDir(dir: string) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async saveQrCode(file: Express.Multer.File): Promise<string> {
    return this.saveFile(file, 'qr-codes');
  }

  async savePaymentProof(file: Express.Multer.File): Promise<string> {
    return this.saveFile(file, 'payment-proofs');
  }

  private async saveFile(file: Express.Multer.File, subDir: string): Promise<string> {
    const ext = path.extname(file.originalname);
    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(this.uploadsDir, subDir, filename);

    fs.writeFileSync(filePath, file.buffer);

    // Return the URL path (relative to uploads directory)
    return `/uploads/${subDir}/${filename}`;
  }
}
