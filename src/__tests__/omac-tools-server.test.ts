import { describe, it, expect } from 'vitest';
import { omacToolsServer, omacToolNames, getOmacToolNames } from '../mcp/omac-tools-server.js';

const interopEnabled = process.env.OMAC_INTEROP_TOOLS_ENABLED === '1';
const totalTools = interopEnabled ? 57 : 49;
const withoutLsp = interopEnabled ? 45 : 37;
const withoutAst = interopEnabled ? 55 : 47;
const withoutPython = interopEnabled ? 56 : 48;
const withoutSkills = interopEnabled ? 54 : 46;

describe('omac-tools-server', () => {
  describe('omacToolNames', () => {
    it('should export expected tools total', () => {
      expect(omacToolNames).toHaveLength(totalTools);
    });

    it('should have 12 LSP tools', () => {
      const lspTools = omacToolNames.filter(n => n.includes('lsp_'));
      expect(lspTools).toHaveLength(12);
    });

    it('should have 2 AST tools', () => {
      const astTools = omacToolNames.filter(n => n.includes('ast_'));
      expect(astTools).toHaveLength(2);
    });

    it('should have python_repl tool', () => {
      expect(omacToolNames).toContain('mcp__t__python_repl');
    });

    it('should have session_search tool', () => {
      expect(omacToolNames).toContain('mcp__t__session_search');
    });

    it('should use correct MCP naming format', () => {
      omacToolNames.forEach(name => {
        expect(name).toMatch(/^mcp__t__/);
      });
    });
  });

  describe('getOmacToolNames', () => {
    it('should return all tools by default', () => {
      const tools = getOmacToolNames();
      expect(tools).toHaveLength(totalTools);
    });

    it('should filter out LSP tools when includeLsp is false', () => {
      const tools = getOmacToolNames({ includeLsp: false });
      expect(tools.some(t => t.includes('lsp_'))).toBe(false);
      expect(tools).toHaveLength(withoutLsp);
    });

    it('should filter out AST tools when includeAst is false', () => {
      const tools = getOmacToolNames({ includeAst: false });
      expect(tools.some(t => t.includes('ast_'))).toBe(false);
      expect(tools).toHaveLength(withoutAst);
    });

    it('should filter out python_repl when includePython is false', () => {
      const tools = getOmacToolNames({ includePython: false });
      expect(tools.some(t => t.includes('python_repl'))).toBe(false);
      expect(tools).toHaveLength(withoutPython);
    });

    it('should filter out skills tools', () => {
      const names = getOmacToolNames({ includeSkills: false });
      expect(names).toHaveLength(withoutSkills);
      expect(names.every(n => !n.includes('load_omac_skills') && !n.includes('list_omac_skills'))).toBe(true);
    });

    it('should have 3 skills tools', () => {
      const skillsTools = omacToolNames.filter(n => n.includes('load_omac_skills') || n.includes('list_omac_skills'));
      expect(skillsTools).toHaveLength(3);
    });

    it('supports includeInterop filter option', () => {
      const withInterop = getOmacToolNames({ includeInterop: true });
      const withoutInterop = getOmacToolNames({ includeInterop: false });

      if (interopEnabled) {
        expect(withInterop.some(n => n.includes('interop_'))).toBe(true);
      }
      expect(withoutInterop.some(n => n.includes('interop_'))).toBe(false);
    });
  });

  describe('omacToolsServer', () => {
    it('should be defined', () => {
      expect(omacToolsServer).toBeDefined();
    });
  });
});
