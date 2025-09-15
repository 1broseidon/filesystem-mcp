# File System MCP

A foundational File System MCP server for persistent file operations with shareable URLs and dashboard integration.

## Features

- **Complete File Operations**: Create, read, update, delete files and directories
- **Secure Workspace**: All operations confined to user workspace with path validation
- **Shareable URLs**: Generate time-limited shareable links for files
- **File Search**: Search by filename patterns or file content
- **Rich Metadata**: File type detection, timestamps, permissions, and MIME types
- **Dashboard Ready**: Designed for integration with platform dashboard
- **Future 3rd Party Integration**: Extensible for OneDrive, Google Drive, etc.

## MCP Tools

### Core File Operations

1. **list_files** - List files and directories with optional recursive scanning
2. **read_file** - Read file contents with encoding support
3. **write_file** - Write/create files with automatic directory creation
4. **delete_file** - Delete files or directories safely
5. **create_directory** - Create directories including parent paths

### Advanced Features

6. **get_file_info** - Get detailed file metadata (size, dates, permissions, MIME type)
7. **search_files** - Search by filename patterns or content with configurable limits
8. **get_shareable_url** - Generate shareable URLs with expiration times

## Usage Examples

### Basic File Operations

```javascript
// List files in workspace root
await mcp.callTool('list_files', { path: '.', recursive: false });

// Create a document
await mcp.callTool('write_file', {
  path: 'documents/report.md',
  content: '# Project Report\n\nThis is my project report...'
});

// Read the document
await mcp.callTool('read_file', { path: 'documents/report.md' });
```

### File Management

```javascript
// Create project structure
await mcp.callTool('create_directory', { path: 'projects/website' });

// Get file information
await mcp.callTool('get_file_info', { path: 'documents/report.md' });

// Search for files
await mcp.callTool('search_files', {
  pattern: '*.md',
  search_content: true,
  max_results: 20
});
```

### Sharing and URLs

```javascript
// Generate shareable URL for a PDF
await mcp.callTool('get_shareable_url', {
  path: 'documents/presentation.pdf',
  expires_in: 48  // 48 hours
});
```

## Integration Features

### Dashboard Integration
- File listing API ready for dashboard display
- Rich metadata for file browsers
- MIME type detection for proper file icons

### Memory MCP Integration
- File operations can be logged to Memory MCP
- Document metadata stored as memories
- File relationships tracked in knowledge graph

### Security
- Path validation prevents directory traversal attacks
- Operations confined to user workspace
- Shareable URLs with expiration times

## Persistent Storage

Files are stored in persistent volumes within Kubernetes:
- User workspace isolation
- Automatic backup capabilities
- Volume expansion support
- Cross-pod file access

## Future Integrations

Designed for extensibility with:
- **OneDrive** - Sync files to Microsoft OneDrive
- **Google Drive** - Backup and sync with Google Drive
- **Dropbox** - Cross-platform file synchronization
- **S3** - Archive and backup to AWS S3

## File Structure Examples

```
workspace/
├── documents/
│   ├── reports/
│   │   ├── q1-report.pdf
│   │   └── presentation.pptx
│   └── notes.md
├── projects/
│   └── website/
│       ├── index.html
│       └── styles.css
└── downloads/
    └── data.csv
```

## Error Handling

- Path validation for security
- Graceful handling of missing files
- Permission and disk space errors
- Encoding detection and conversion

## Environment Variables

- `WORKSPACE_DIR` - Base workspace directory (default: `/app/workspace`)
- `PLATFORM_URL` - Platform base URL for shareable links

## License

MIT