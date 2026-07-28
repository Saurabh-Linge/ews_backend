import { Test, TestingModule } from '@nestjs/testing';
import { CbsRulesService } from './cbs-rules.service';
import { DatabaseService } from '../../../core/database/database.service';

describe('CbsRulesService', () => {
  let service: CbsRulesService;

  const mockDatabaseService = {
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CbsRulesService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<CbsRulesService>(CbsRulesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Expression Parsing and Evaluation', () => {
    it('should correctly parse and evaluate parenthesized arithmetic expressions', () => {
      const context = {
        interest_outstanding: 16157,
        instal_amt: 17283,
      };

      const expr = 'interest_outstanding > (instal_amt * 2)';
      const ast = service.parseExpressionToAST(expr);
      
      expect(ast).toEqual({
        type: 'COMPARE',
        left: {
          type: 'VARIABLE',
          name: 'interest_outstanding',
        },
        op: '>',
        right: {
          type: 'ARITHMETIC',
          left: {
            type: 'VARIABLE',
            name: 'instal_amt',
          },
          op: '*',
          right: {
            type: 'LITERAL',
            value: 2,
          },
        },
      });

      const result = service.evaluateAST(ast, context);
      expect(result).toBe(false);
    });

    it('should correctly evaluate when the condition is met', () => {
      const context = {
        interest_outstanding: 40000,
        instal_amt: 17283,
      };

      const expr = 'interest_outstanding > (instal_amt * 2)';
      const result = service.evaluate(expr, context);
      expect(result).toBe(true);
    });

    it('should handle nested logical expressions and parentheses', () => {
      const context = {
        a: 10,
        b: 5,
        c: 3,
      };
      
      const expr = '(a > b) AND (c > 2)';
      const result = service.evaluate(expr, context);
      expect(result).toBe(true);
    });
  });
});
