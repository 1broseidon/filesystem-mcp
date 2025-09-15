#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import mime from 'mime-types';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FileSystemMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'filesystem-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Set up workspace directory
    this.workspaceDir = process.env.WORKSPACE_DIR || '/app/workspace';
    this.ensureWorkspaceDirectory();
    this.setupHandlers();

    console.error('File System MCP: Workspace initialized at', this.workspaceDir);
  }

  ensureWorkspaceDirectory() {
    try {
      // First try to create the parent directory if it doesn't exist
      const parentDir = path.dirname(this.workspaceDir);
      if (!fs.existsSync(parentDir)) {
        console.error('Parent directory does not exist:', parentDir);
        console.error('Available directories:');
        console.error(fs.readdirSync('/'));
      }
      fs.ensureDirSync(this.workspaceDir);
    } catch (error) {
      console.error('Failed to create workspace directory:', error);
      // Fallback to /tmp if /app doesn't work
      this.workspaceDir = '/tmp/filesystem-workspace';
      try {
        fs.ensureDirSync(this.workspaceDir);
        console.error('Using fallback workspace directory:', this.workspaceDir);
      } catch (fallbackError) {
        console.error('Fallback workspace creation also failed:', fallbackError);
        throw fallbackError;
      }
    }
  }

  // Ensure all file operations stay within workspace boundaries
  validatePath(filePath) {
    const fullPath = path.resolve(this.workspaceDir, filePath);
    const workspaceAbsolute = path.resolve(this.workspaceDir);

    if (!fullPath.startsWith(workspaceAbsolute)) {
      throw new Error('Access denied: Path outside workspace');
    }

    return fullPath;
  }

  setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'list_files',
          description: 'List files and directories in a path',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Directory path to list (relative to workspace)',
                default: '.'
              },
              recursive: {
                type: 'boolean',
                description: 'List files recursively',
                default: false
              }
            }
          }
        },
        {
          name: 'read_file',
          description: 'Read the contents of a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'File path to read (relative to workspace)'
              },
              encoding: {
                type: 'string',
                description: 'File encoding (utf8, base64, etc.)',
                default: 'utf8'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'write_file',
          description: 'Write content to a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'File path to write (relative to workspace)'
              },
              content: {
                type: 'string',
                description: 'Content to write to file'
              },
              encoding: {
                type: 'string',
                description: 'File encoding (utf8, base64, etc.)',
                default: 'utf8'
              }
            },
            required: ['path', 'content']
          }
        },
        {
          name: 'delete_file',
          description: 'Delete a file or directory',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'File or directory path to delete (relative to workspace)'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'create_directory',
          description: 'Create a directory (including parent directories)',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Directory path to create (relative to workspace)'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'get_file_info',
          description: 'Get detailed information about a file or directory',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'File or directory path (relative to workspace)'
              }
            },
            required: ['path']
          }
        },
        {
          name: 'search_files',
          description: 'Search for files by name pattern or content',
          inputSchema: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Search pattern (glob or regex)'
              },
              search_content: {
                type: 'boolean',
                description: 'Search within file contents',
                default: false
              },
              max_results: {
                type: 'number',
                description: 'Maximum number of results',
                default: 50
              }
            },
            required: ['pattern']
          }
        },
        {
          name: 'get_shareable_url',
          description: 'Generate a shareable URL for a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'File path (relative to workspace)'
              },
              expires_in: {
                type: 'number',
                description: 'URL expiration time in hours',
                default: 24
              }
            },
            required: ['path']
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'list_files':
            return await this.listFiles(args);
          case 'read_file':
            return await this.readFile(args);
          case 'write_file':
            return await this.writeFile(args);
          case 'delete_file':
            return await this.deleteFile(args);
          case 'create_directory':
            return await this.createDirectory(args);
          case 'get_file_info':
            return await this.getFileInfo(args);
          case 'search_files':
            return await this.searchFiles(args);
          case 'get_shareable_url':
            return await this.getShareableUrl(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ]
        };
      }
    });
  }

  async listFiles(args) {
    const { path: dirPath = '.', recursive = false } = args;
    const fullPath = this.validatePath(dirPath);

    try {
      const items = [];

      if (recursive) {
        const walk = async (dir) => {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            const entryPath = path.join(dir, entry.name);
            const relativePath = path.relative(this.workspaceDir, entryPath);

            const stat = await fs.stat(entryPath);
            items.push({
              name: entry.name,
              path: relativePath,
              type: entry.isDirectory() ? 'directory' : 'file',
              size: stat.size,
              modified: stat.mtime,
              mimetype: entry.isFile() ? mime.lookup(entry.name) || 'application/octet-stream' : null
            });

            if (entry.isDirectory()) {
              await walk(entryPath);
            }
          }
        };
        await walk(fullPath);
      } else {
        const entries = await fs.readdir(fullPath, { withFileTypes: true });
        for (const entry of entries) {
          const entryPath = path.join(fullPath, entry.name);
          const relativePath = path.relative(this.workspaceDir, entryPath);

          const stat = await fs.stat(entryPath);
          items.push({
            name: entry.name,
            path: relativePath,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: stat.size,
            modified: stat.mtime,
            mimetype: entry.isFile() ? mime.lookup(entry.name) || 'application/octet-stream' : null
          });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              path: dirPath,
              items: items.sort((a, b) => {
                // Directories first, then files
                if (a.type !== b.type) {
                  return a.type === 'directory' ? -1 : 1;
                }
                return a.name.localeCompare(b.name);
              })
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  async readFile(args) {
    const { path: filePath, encoding = 'utf8' } = args;
    const fullPath = this.validatePath(filePath);

    try {
      const content = await fs.readFile(fullPath, encoding);
      const stat = await fs.stat(fullPath);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              path: filePath,
              content: content,
              size: stat.size,
              encoding: encoding,
              mimetype: mime.lookup(filePath) || 'application/octet-stream'
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  async writeFile(args) {
    const { path: filePath, content, encoding = 'utf8' } = args;
    const fullPath = this.validatePath(filePath);

    try {
      // Ensure parent directory exists
      await fs.ensureDir(path.dirname(fullPath));

      await fs.writeFile(fullPath, content, encoding);
      const stat = await fs.stat(fullPath);

      return {
        content: [
          {
            type: 'text',
            text: `File written successfully: ${filePath} (${stat.size} bytes)`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  async deleteFile(args) {
    const { path: filePath } = args;
    const fullPath = this.validatePath(filePath);

    try {
      await fs.remove(fullPath);

      return {
        content: [
          {
            type: 'text',
            text: `Deleted successfully: ${filePath}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to delete: ${error.message}`);
    }
  }

  async createDirectory(args) {
    const { path: dirPath } = args;
    const fullPath = this.validatePath(dirPath);

    try {
      await fs.ensureDir(fullPath);

      return {
        content: [
          {
            type: 'text',
            text: `Directory created successfully: ${dirPath}`
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to create directory: ${error.message}`);
    }
  }

  async getFileInfo(args) {
    const { path: filePath } = args;
    const fullPath = this.validatePath(filePath);

    try {
      const stat = await fs.stat(fullPath);
      const isDirectory = stat.isDirectory();

      const info = {
        path: filePath,
        name: path.basename(filePath),
        type: isDirectory ? 'directory' : 'file',
        size: stat.size,
        created: stat.birthtime,
        modified: stat.mtime,
        accessed: stat.atime,
        permissions: stat.mode,
        mimetype: isDirectory ? null : mime.lookup(filePath) || 'application/octet-stream'
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(info, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  async searchFiles(args) {
    const { pattern, search_content = false, max_results = 50 } = args;

    try {
      const results = [];

      const searchDirectory = async (dir) => {
        if (results.length >= max_results) return;

        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (results.length >= max_results) break;

          const entryPath = path.join(dir, entry.name);
          const relativePath = path.relative(this.workspaceDir, entryPath);

          // Check filename match
          const nameMatch = entry.name.includes(pattern) ||
                           entry.name.match(new RegExp(pattern, 'i'));

          let contentMatch = false;
          if (search_content && entry.isFile()) {
            try {
              const content = await fs.readFile(entryPath, 'utf8');
              contentMatch = content.includes(pattern) ||
                           content.match(new RegExp(pattern, 'i'));
            } catch (error) {
              // Skip files that can't be read as text
            }
          }

          if (nameMatch || contentMatch) {
            const stat = await fs.stat(entryPath);
            results.push({
              name: entry.name,
              path: relativePath,
              type: entry.isDirectory() ? 'directory' : 'file',
              size: stat.size,
              modified: stat.mtime,
              match_type: nameMatch ? 'filename' : 'content'
            });
          }

          // Recurse into directories
          if (entry.isDirectory()) {
            await searchDirectory(entryPath);
          }
        }
      };

      await searchDirectory(this.workspaceDir);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              pattern: pattern,
              results: results,
              total_found: results.length,
              search_content: search_content
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Search failed: ${error.message}`);
    }
  }

  async getShareableUrl(args) {
    const { path: filePath, expires_in = 24 } = args;
    const fullPath = this.validatePath(filePath);

    try {
      // Verify file exists
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) {
        throw new Error('Only files can have shareable URLs');
      }

      // Generate a unique token for the file
      const fileId = uuidv4();
      const expiresAt = new Date(Date.now() + expires_in * 60 * 60 * 1000);

      // In a real implementation, you'd store this mapping in a database
      // For now, we'll return a URL structure that the platform can use
      const shareableUrl = `${process.env.PLATFORM_URL || 'https://mcp.platform.dev'}/files/share/${fileId}`;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              path: filePath,
              url: shareableUrl,
              file_id: fileId,
              expires_at: expiresAt,
              size: stat.size,
              mimetype: mime.lookup(filePath) || 'application/octet-stream'
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      throw new Error(`Failed to generate shareable URL: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('File System MCP server running on stdio');
  }
}

const server = new FileSystemMCPServer();
server.run().catch(console.error);