import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
  RequestTimeoutException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private pool!: Pool;
  private readonly logger = new Logger(DatabaseService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const isSsl = this.configService.get<string>('DB_SSL') === 'true';

    this.pool = new Pool({
      host: this.configService.get<string>('DB_HOST', 'localhost'),
      port: this.configService.get<number>('DB_PORT', 5432),
      user: this.configService.get<string>('DB_USER', 'postgres'),
      password: this.configService.get<string>('DB_PASSWORD', 'postgres'),
      database: this.configService.get<string>('DB_NAME', 'postgres'),
      ssl: isSsl ? { rejectUnauthorized: false } : false,
      max: this.configService.get<number>('DB_POOL_MAX', 30), // Increased default max pool size for better concurrency
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: this.configService.get<number>(
        'DB_CONNECTION_TIMEOUT',
        10000,
      ),
    });

    this.pool.on('error', (err: any) => {
      this.logger.error('Unexpected error on idle client', err);
      process.exit(-1);
    });

    // Disable JIT to prevent massive performance hits on large bulk INSERTS
    // Use setImmediate to defer until after the connection handshake is done,
    // avoiding the "client already executing a query" deprecation warning.
    this.pool.on('connect', (client) => {
      setImmediate(() => {
        client.query('SET jit = off;').catch((err) => {
          this.logger.error('Failed to set jit = off on new connection', err);
        });
      });
    });

    this.logger.log('Database connection pool initialized');
  }

  async onModuleDestroy() {
    this.logger.log('Closing database connection pool');
    await this.pool.end();
  }

  /**
   * Executes a database query.
   * @param text The SQL query string.
   * @param params The query parameters.
   * @returns The query result.
   */
  async query<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
  ): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const res = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      this.logger.debug(`Executed query in ${duration}ms [Rows: ${res?.rowCount || 0}] - ${text.split('\\n').map(l=>l.trim()).join(' ').substring(0, 100)}...`);
      return res;
    } catch (error: any) {
      const poolStatus = this.pool
        ? {
            total: this.pool.totalCount,
            idle: this.pool.idleCount,
            waiting: this.pool.waitingCount,
          }
        : 'No Pool';
      this.logger.error(
        `Error executing query [Pool: ${JSON.stringify(poolStatus)}]: ${text.split('\\n').map(l=>l.trim()).join(' ').substring(0, 150)}...`,
        error,
      );
      if (
        error?.message &&
        (error.message.includes('timeout exceeded') ||
          error.message.includes('timeout'))
      ) {
        throw new RequestTimeoutException(
          'Database request timed out due to high load. Please try again in a few moments.',
        );
      }
      throw error;
    }
  }

  /**
   * Executes a query and returns the first row or null if not found.
   * @param text The SQL query string.
   * @param params The query parameters.
   * @returns The first row or null.
   */
  async findOne<T extends QueryResultRow = any>(
    text: string,
    params?: any[],
  ): Promise<T | null> {
    const res = await this.query<T>(text, params);
    return res.rows[0] || null;
  }

  /**
   * Executes a callback within a managed database transaction.
   * @param callback The function to execute within the transaction.
   * @returns The result of the callback.
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    let client: PoolClient;
    try {
      client = await this.pool.connect();
    } catch (error: any) {
      const poolStatus = this.pool
        ? {
            total: this.pool.totalCount,
            idle: this.pool.idleCount,
            waiting: this.pool.waitingCount,
          }
        : 'No Pool';
      this.logger.error(
        `Error connecting for transaction | Pool Status: ${JSON.stringify(poolStatus)}`,
        error,
      );
      if (
        error?.message &&
        (error.message.includes('timeout exceeded') ||
          error.message.includes('timeout'))
      ) {
        throw new RequestTimeoutException(
          'Database request timed out due to high load. Please try again in a few moments.',
        );
      }
      throw error;
    }

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (e: any) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        this.logger.error('Error during transaction rollback', rollbackError);
      }
      if (
        e?.message &&
        (e.message.includes('timeout exceeded') ||
          e.message.includes('timeout'))
      ) {
        throw new RequestTimeoutException(
          'Database request timed out due to high load. Please try again in a few moments.',
        );
      }
      throw e;
    } finally {
      client.release();
    }
  }
}
