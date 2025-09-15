# File System MCP - Persistent Storage Strategy

## Overview

Design for enterprise-grade persistent file storage in Kubernetes with user isolation, scalability, and integration with the MCP platform dashboard.

## Storage Architecture

### 1. Per-User Persistent Volume Claims (PVCs)

Each user gets a dedicated PVC for file isolation and security:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: user-files-{user-id}
  namespace: user-{user-id}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi  # Start with 1GB, expandable
  storageClassName: fast-ssd
```

### 2. Workspace Directory Structure

```
/app/workspace/
├── documents/          # User documents
├── projects/           # Project files
├── downloads/          # Downloaded files
├── shared/             # Shared with other users (future)
└── .system/            # System metadata
    ├── file-index.db   # File search index
    └── share-tokens.db # Shareable URL tokens
```

### 3. Storage Classes

- **fast-ssd**: High-performance SSD for active workspaces
- **standard**: Standard storage for archived files
- **backup**: Backup storage class for redundancy

## Integration with Deployment Process

### Modified K8s Provider

Update the Kubernetes provider to include PVC creation:

```javascript
// In k8s.provider.ts
async createUserWorkspace(userId, config) {
  // 1. Create PVC for user files
  await this.createPVC(userId, config.storageSize || '1Gi');

  // 2. Create deployment with volume mount
  await this.createDeploymentWithStorage(userId, config);
}
```

### Deployment Template Updates

File System MCP deployments will include:

```yaml
spec:
  template:
    spec:
      volumes:
        - name: user-workspace
          persistentVolumeClaim:
            claimName: user-files-{user-id}
        - name: shared-code
          emptyDir: {}
      containers:
        - name: mcp-server
          volumeMounts:
            - name: user-workspace
              mountPath: /app/workspace
            - name: shared-code
              mountPath: /app/user-code
```

## Dashboard Integration

### File API Endpoints

```typescript
// New API endpoints for dashboard
GET /api/files/list?path={path}          // List user files
GET /api/files/download/{fileId}         // Download file
POST /api/files/upload                   // Upload files
GET /api/files/share/{shareToken}        // Access shared files
DELETE /api/files/{path}                 // Delete files
```

### Dashboard UI Components

```vue
<template>
  <div class="file-browser">
    <FileTree :files="userFiles" @select="openFile" />
    <FileViewer :file="selectedFile" />
    <ShareDialog :file="selectedFile" @share="generateShareUrl" />
  </div>
</template>
```

## Shareable URLs Implementation

### URL Token Storage

Store shareable URL tokens in both:
1. **Memory MCP** - For relationship tracking
2. **Local SQLite** - For fast token validation

```javascript
// Generate shareable URL
const shareToken = uuidv4();
const expiresAt = new Date(Date.now() + hours * 3600000);

// Store in Memory MCP
await memoryMcp.save_memory({
  key: `share_token_${shareToken}`,
  content: JSON.stringify({
    file_path: filePath,
    user_id: userId,
    expires_at: expiresAt,
    permissions: ['read']
  }),
  tags: ['share_token', 'file_access']
});
```

### Access Control

```javascript
// Validate share token
async function validateShareToken(token) {
  const memory = await memoryMcp.recall_memory({
    key: `share_token_${token}`
  });

  if (!memory || new Date() > new Date(memory.metadata.expires_at)) {
    throw new Error('Token expired or invalid');
  }

  return JSON.parse(memory.content);
}
```

## Storage Scaling Strategy

### Automatic Expansion

```yaml
# Storage monitor deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: storage-monitor
spec:
  template:
    spec:
      containers:
        - name: monitor
          image: storage-monitor:latest
          env:
            - name: EXPANSION_THRESHOLD
              value: "80%"  # Expand when 80% full
            - name: EXPANSION_INCREMENT
              value: "1Gi"  # Add 1GB each time
```

### Storage Tiers

- **Hot**: Files accessed in last 30 days (SSD)
- **Warm**: Files accessed in last 90 days (Standard)
- **Cold**: Files older than 90 days (Archive)

## Security Considerations

### Path Validation

```javascript
function validatePath(userPath, workspaceRoot) {
  const fullPath = path.resolve(workspaceRoot, userPath);
  if (!fullPath.startsWith(workspaceRoot)) {
    throw new Error('Path traversal attempt detected');
  }
  return fullPath;
}
```

### File Access Logs

All file operations logged to Memory MCP:

```javascript
await memoryMcp.save_memory({
  key: `file_access_${Date.now()}`,
  content: `User ${userId} accessed ${filePath}`,
  tags: ['file_access', 'audit', 'security'],
  metadata: {
    action: 'read',
    file_path: filePath,
    user_id: userId,
    timestamp: new Date().toISOString()
  }
});
```

## Backup Strategy

### Incremental Backups

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: file-backup
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: backup-agent:latest
              command:
                - /scripts/incremental-backup.sh
              volumeMounts:
                - name: user-workspaces
                  mountPath: /data
                - name: backup-storage
                  mountPath: /backup
```

## 3rd Party Integration (Future)

### OneDrive Integration

```javascript
class OneDriveSync {
  async syncFile(filePath, content) {
    // Upload to OneDrive
    const result = await this.oneDriveClient.upload(filePath, content);

    // Update Memory MCP with sync status
    await memoryMcp.save_memory({
      key: `onedrive_sync_${filePath}`,
      content: `File synced to OneDrive: ${result.webUrl}`,
      tags: ['onedrive', 'sync', 'backup']
    });
  }
}
```

## Performance Optimizations

### File Indexing

- SQLite FTS (Full-Text Search) for content search
- File metadata caching in Memory MCP
- Lazy loading for large directories

### Compression

- Automatic compression for files > 1MB
- Transparent decompression on access
- Storage space optimization

## Implementation Priority

1. **Phase 1**: Basic PVC creation and mounting ✅
2. **Phase 2**: Dashboard file browser API
3. **Phase 3**: Shareable URLs with Memory MCP integration
4. **Phase 4**: Backup and scaling automation
5. **Phase 5**: 3rd party storage sync

This strategy provides enterprise-grade file storage while maintaining the simplicity and speed of the MCP platform deployment model.