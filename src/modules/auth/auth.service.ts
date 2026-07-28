import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../core/database/database.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const res = await this.db.query(
      `
      SELECT u.*, r.name as role_name 
      FROM ews_users u
      JOIN ews_roles r ON u.role_id = r.id
      WHERE u.username = $1 AND u.is_active = true
    `,
      [username],
    );

    const user = res.rows[0];
    if (!user) return null;

    // For demo/testing, simple plain text match. Or bcrypt if you prefer.
    const isValid = user.password === pass;

    if (!isValid) return null;

    // Fetch assigned branches
    const branchRes = await this.db.query(
      `
      SELECT branch_id FROM ews_user_branches WHERE user_id = $1
    `,
      [user.id],
    );
    const branchIds = branchRes.rows.map((r) => r.branch_id);

    return { ...user, branchIds };
  }

  async login(username: string, pass: string) {
    const user = await this.validateUser(username, pass);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = {
      username: user.username,
      sub: user.id,
      role: user.role_name,
      branches: user.branchIds,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        role: user.role_name,
        branches: user.branchIds,
      },
    };
  }
}
