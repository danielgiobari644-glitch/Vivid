# GIODAI — Firestore Database Schema

## Overview

GIODAI uses **Cloud Firestore** as its primary database. Data is organized into five
top-level collections, each scoped to a single user via a `userId` field (except
`templates`, which is a shared read-only resource). All timestamps use Firestore
`Timestamp` objects (server-side) or ISO-8601 strings depending on the client.

---

## Collections

| Collection       | Owner-scoped | Client Reads | Client Writes | Admin Writes |
|------------------|:------------:|:------------:|:-------------:|:------------:|
| `users`          | Yes          | Own doc only  | Own doc only  | —            |
| `projects`       | Yes          | Own only      | Own only      | —            |
| `templates`      | No           | All auth'd    | None          | Yes (CF)     |
| `settings`       | Yes          | Own only      | Own only      | —            |
| `history`        | Yes          | Own only      | Create only   | Yes (CF)     |
| `renderJobs`     | Yes          | Own only      | Create only   | Yes (CF)     |

---

## 1. `users/{userId}`

Stores each user's profile and application-level preferences.

### Fields

| Field          | Type      | Required | Description |
|----------------|-----------|:--------:|-------------|
| `uid`          | `string`  | Yes      | Firebase Auth UID. Matches the document ID. |
| `email`        | `string`  | Yes      | User's email address. |
| `displayName`  | `string`  | Yes      | Display name shown in the UI. |
| `photoURL`     | `string`  | No       | URL to the user's avatar image. |
| `provider`     | `string`  | Yes      | Auth provider used to sign in (`google`, `email`, `github`, etc.). |
| `createdAt`    | `timestamp`| Yes      | Server timestamp when the document was created. |
| `updatedAt`    | `timestamp`| Yes      | Server timestamp of the last update. |
| `settings`     | `map`     | No       | Nested object with user preferences (see below). |

#### `settings` Sub-map

| Key                 | Type      | Default     | Description |
|---------------------|-----------|-------------|-------------|
| `theme`             | `string`  | `"dark"`    | UI theme preference (`"light"` or `"dark"`). |
| `defaultAspectRatio`| `string`  | `"16:9"`    | Default aspect ratio for new projects. |
| `defaultResolution` | `string`  | `"1080p"`   | Default export resolution. |
| `notifications`     | `boolean` | `true`      | Whether push/email notifications are enabled. |
| `autoSave`          | `boolean` | `true`      | Whether projects auto-save on edit. |

### Example Document

```json
{
  "uid": "aBcDeFgHiJkLmNoPqRsTuVwXyZ",
  "email": "user@example.com",
  "displayName": "Jane Doe",
  "photoURL": "https://example.com/avatars/jane.jpg",
  "provider": "google",
  "createdAt": "2025-01-15T08:30:00.000Z",
  "updatedAt": "2025-06-20T14:22:10.000Z",
  "settings": {
    "theme": "dark",
    "defaultAspectRatio": "16:9",
    "defaultResolution": "1080p",
    "notifications": true,
    "autoSave": true
  }
}
```

### Security Rules Summary

- **Read**: Authenticated user where `userId == request.auth.uid`.
- **Create/Update/Delete**: Same ownership condition.

---

## 2. `projects/{projectId}`

A project represents a single video editing session. Each project is owned by
exactly one user and contains all media, text, audio, and export settings needed
to render a video.

### Fields

| Field          | Type           | Required | Description |
|----------------|----------------|:--------:|-------------|
| `id`           | `string`       | Yes      | Unique project identifier (matches document ID). |
| `userId`       | `string`       | Yes      | Owner's Firebase Auth UID. |
| `name`         | `string`       | Yes      | Human-readable project name. |
| `description`  | `string`       | No       | Optional project description. |
| `aspectRatio`  | `string`       | Yes      | Video aspect ratio. One of: `16:9`, `9:16`, `1:1`, `4:5`, `3:2`. |
| `images`       | `array<map>`   | Yes      | Ordered list of images in the project (see below). |
| `texts`        | `array<map>`   | Yes      | Ordered list of text overlays (see below). |
| `audio`        | `map`          | No       | Background audio configuration (see below). |
| `settings`     | `map`          | Yes      | Export/render settings (see below). |
| `thumbnail`    | `string`       | No       | URL to the project's preview thumbnail. |
| `createdAt`    | `timestamp`    | Yes      | Server timestamp of project creation. |
| `updatedAt`    | `timestamp`    | Yes      | Server timestamp of the last modification. |
| `duration`     | `number`       | Yes      | Total video duration in seconds. |

#### `images[]` Element

| Key          | Type     | Description |
|--------------|----------|-------------|
| `id`         | `string` | Unique identifier for this image asset. |
| `url`        | `string` | Storage URL for the full-resolution image. |
| `name`       | `string` | Original filename or display name. |
| `duration`   | `number` | Display duration in seconds. |
| `order`      | `number` | Display order in the timeline (0-based). |
| `effect`     | `string` | Visual effect applied (`"none"`, `"fade"`, `"zoom"`, `"blur"`, etc.). |
| `transition` | `string` | Transition into the next image (`"none"`, `"crossfade"`, `"slide"`, etc.). |
| `cropX`      | `number` | Normalized horizontal crop offset (0.0 – 1.0). |
| `cropY`      | `number` | Normalized vertical crop offset (0.0 – 1.0). |
| `cropWidth`  | `number` | Normalized crop width (0.0 – 1.0). |
| `cropHeight` | `number` | Normalized crop height (0.0 – 1.0). |
| `rotation`   | `number` | Rotation angle in degrees (0, 90, 180, 270). |
| `zoomLevel`  | `number` | Zoom multiplier (1.0 = no zoom). |

#### `texts[]` Element

| Key          | Type     | Description |
|--------------|----------|-------------|
| `id`         | `string` | Unique identifier for this text overlay. |
| `content`    | `string` | The text content to display. |
| `fontFamily` | `string` | CSS font family name. |
| `fontSize`   | `number` | Font size in pixels. |
| `fontColor`  | `string` | Hex color string (e.g., `"#FFFFFF"`). |
| `x`          | `number` | Horizontal position as a percentage (0 – 100). |
| `y`          | `number` | Vertical position as a percentage (0 – 100). |
| `startTime`  | `number` | Timeline start time in seconds. |
| `endTime`    | `number` | Timeline end time in seconds. |
| `animation`  | `string` | Entrance animation (`"none"`, `"fadeIn"`, `"typewriter"`, etc.). |
| `shadow`     | `boolean`| Whether a drop shadow is applied. |
| `outline`    | `boolean`| Whether a text outline is applied. |
| `bold`       | `boolean`| Whether the text is bold. |
| `italic`     | `boolean`| Whether the text is italic. |

#### `audio` Map

| Key               | Type     | Description |
|-------------------|----------|-------------|
| `url`             | `string` | Storage URL for the audio file. |
| `name`            | `string` | Display name of the audio track. |
| `volume`          | `number` | Volume level (0.0 – 1.0). |
| `fadeInDuration`  | `number` | Fade-in duration in seconds. |
| `fadeOutDuration` | `number` | Fade-out duration in seconds. |
| `trimStart`       | `number` | Trim offset from the start in seconds. |
| `trimEnd`         | `number` | Trim offset from the end in seconds. |

#### `settings` Map

| Key              | Type     | Description |
|------------------|----------|-------------|
| `resolution`     | `string` | Export resolution (`"720p"`, `"1080p"`, `"1440p"`, `"4K"`). |
| `fps`            | `number` | Frames per second (24, 30, or 60). |
| `backgroundColor`| `string` | Hex background color (`"#000000"`). |
| `quality`        | `number` | Encoding quality (0 – 100). |

### Example Document

```json
{
  "id": "proj_abc123def456",
  "userId": "aBcDeFgHiJkLmNoPqRsTuVwXyZ",
  "name": "Summer Vacation Reel",
  "description": "Highlights from our 2025 trip to Japan.",
  "aspectRatio": "9:16",
  "images": [
    {
      "id": "img_001",
      "url": "https://storage.example.com/images/photo1.jpg",
      "name": "tokyo-tower.jpg",
      "duration": 4.0,
      "order": 0,
      "effect": "kenburns",
      "transition": "crossfade",
      "cropX": 0.1,
      "cropY": 0.05,
      "cropWidth": 0.8,
      "cropHeight": 0.9,
      "rotation": 0,
      "zoomLevel": 1.2
    },
    {
      "id": "img_002",
      "url": "https://storage.example.com/images/photo2.jpg",
      "name": "shibuya-crossing.jpg",
      "duration": 3.5,
      "order": 1,
      "effect": "none",
      "transition": "slide",
      "cropX": 0.0,
      "cropY": 0.0,
      "cropWidth": 1.0,
      "cropHeight": 1.0,
      "rotation": 0,
      "zoomLevel": 1.0
    }
  ],
  "texts": [
    {
      "id": "txt_001",
      "content": "Tokyo 2025",
      "fontFamily": "Montserrat",
      "fontSize": 48,
      "fontColor": "#FFFFFF",
      "x": 50,
      "y": 80,
      "startTime": 0.0,
      "endTime": 4.0,
      "animation": "fadeIn",
      "shadow": true,
      "outline": false,
      "bold": true,
      "italic": false
    }
  ],
  "audio": {
    "url": "https://storage.example.com/audio/ambient.mp3",
    "name": "Lo-fi Ambient.mp3",
    "volume": 0.7,
    "fadeInDuration": 1.0,
    "fadeOutDuration": 2.0,
    "trimStart": 0.0,
    "trimEnd": 0.0
  },
  "settings": {
    "resolution": "1080p",
    "fps": 30,
    "backgroundColor": "#000000",
    "quality": 85
  },
  "thumbnail": "https://storage.example.com/thumbnails/proj_abc123def456.jpg",
  "createdAt": "2025-06-01T10:00:00.000Z",
  "updatedAt": "2025-06-20T15:30:00.000Z",
  "duration": 12.5
}
```

### Security Rules Summary

- **Read**: Authenticated, `resource.data.userId == request.auth.uid`.
- **Create**: Authenticated, `request.resource.data.userId == request.auth.uid`, valid `aspectRatio`, size check.
- **Update**: Authenticated, owner, valid `aspectRatio` if changed, size check.
- **Delete**: Authenticated, owner.

---

## 3. `templates/{templateId}`

Pre-built video layouts that any authenticated user can browse. Templates are
created and managed exclusively by admins or backend Cloud Functions.

### Fields

| Field          | Type         | Required | Description |
|----------------|--------------|:--------:|-------------|
| `id`           | `string`     | Yes      | Unique template identifier (matches document ID). |
| `name`         | `string`     | Yes      | Display name. |
| `description`  | `string`     | Yes      | Short description of the template. |
| `category`     | `string`     | Yes      | Category for browsing (`"social"`, `"business"`, `"travel"`, etc.). |
| `thumbnail`    | `string`     | Yes      | URL to the template's preview image. |
| `aspectRatio`  | `string`     | Yes      | Video aspect ratio. One of: `16:9`, `9:16`, `1:1`, `4:5`, `3:2`. |
| `images`       | `array<map>` | Yes      | Placeholder image slots (same schema as project images). |
| `texts`        | `array<map>` | Yes      | Placeholder text overlays (same schema as project texts). |
| `audio`        | `map`        | No       | Default audio configuration (same schema as project audio). |
| `settings`     | `map`        | Yes      | Default render settings (same schema as project settings). |
| `isPremium`    | `boolean`    | Yes      | Whether the template requires a premium subscription. |
| `downloadCount`| `number`     | Yes      | Number of times the template has been used. |
| `rating`       | `number`     | Yes      | Average user rating (0.0 – 5.0). |
| `tags`         | `array<string>`| Yes    | Searchable tags for discovery. |

### Example Document

```json
{
  "id": "tmpl_social_story_01",
  "name": "Instagram Story — Travel",
  "description": "A vibrant vertical template for travel photos with animated text overlays.",
  "category": "social",
  "thumbnail": "https://storage.example.com/templates/social-story-01.jpg",
  "aspectRatio": "9:16",
  "images": [
    {
      "id": "slot_001",
      "url": "",
      "name": "Photo 1",
      "duration": 4.0,
      "order": 0,
      "effect": "kenburns",
      "transition": "crossfade",
      "cropX": 0.0,
      "cropY": 0.0,
      "cropWidth": 1.0,
      "cropHeight": 1.0,
      "rotation": 0,
      "zoomLevel": 1.0
    },
    {
      "id": "slot_002",
      "url": "",
      "name": "Photo 2",
      "duration": 3.0,
      "order": 1,
      "effect": "none",
      "transition": "crossfade",
      "cropX": 0.0,
      "cropY": 0.0,
      "cropWidth": 1.0,
      "cropHeight": 1.0,
      "rotation": 0,
      "zoomLevel": 1.0
    }
  ],
  "texts": [
    {
      "id": "txt_slot_001",
      "content": "Your Title Here",
      "fontFamily": "Montserrat",
      "fontSize": 36,
      "fontColor": "#FFFFFF",
      "x": 50,
      "y": 15,
      "startTime": 0.0,
      "endTime": 7.0,
      "animation": "fadeIn",
      "shadow": true,
      "outline": false,
      "bold": true,
      "italic": false
    }
  ],
  "audio": {
    "url": "https://storage.example.com/audio/default-travel.mp3",
    "name": "Travel Ambience.mp3",
    "volume": 0.5,
    "fadeInDuration": 1.0,
    "fadeOutDuration": 1.5,
    "trimStart": 0.0,
    "trimEnd": 0.0
  },
  "settings": {
    "resolution": "1080p",
    "fps": 30,
    "backgroundColor": "#1A1A2E",
    "quality": 90
  },
  "isPremium": false,
  "downloadCount": 3420,
  "rating": 4.7,
  "tags": ["travel", "instagram", "story", "vertical", "social"]
}
```

### Security Rules Summary

- **Read**: Any authenticated user.
- **Write**: Denied (`allow write: if false`). Managed by admin Cloud Functions only.

---

## 4. `settings/{settingsId}`

Per-user application settings stored as a top-level collection. This complements
the `settings` map on the user document and allows targeted queries and security
rules for preference management.

### Fields

| Field          | Type       | Required | Description |
|----------------|------------|:--------:|-------------|
| `userId`       | `string`   | Yes      | Owner's Firebase Auth UID. |
| `theme`        | `string`   | No       | UI theme (`"light"` or `"dark"`). |
| `defaultAspectRatio`| `string`| No       | Default aspect ratio for new projects. |
| `defaultResolution` | `string`| No       | Default export resolution. |
| `notifications`| `boolean`  | No       | Push/email notification preference. |
| `autoSave`     | `boolean`  | No       | Auto-save on edit preference. |

### Example Document

```json
{
  "userId": "aBcDeFgHiJkLmNoPqRsTuVwXyZ",
  "theme": "dark",
  "defaultAspectRatio": "16:9",
  "defaultResolution": "1080p",
  "notifications": true,
  "autoSave": true
}
```

### Security Rules Summary

- **Read/Write**: Authenticated, `resource.data.userId == request.auth.uid`.

---

## 5. `history/{historyId}`

An append-only log of user actions within the application. Used for audit trails,
undo/redo support, and activity feeds. Users can read and create entries but
cannot modify or delete them.

### Fields

| Field       | Type       | Required | Description |
|-------------|------------|:--------:|-------------|
| `id`        | `string`   | Yes      | Unique entry identifier (matches document ID). |
| `userId`    | `string`   | Yes      | Acting user's Firebase Auth UID. |
| `projectId` | `string`   | No       | Related project ID (if the action is project-scoped). |
| `action`    | `string`   | Yes      | Action type (`"create_project"`, `"edit_project"`, `"render"`, `"delete_project"`, `"export"`, `"update_settings"`, etc.). |
| `details`   | `string`   | No       | Human-readable description of the action. |
| `createdAt` | `timestamp`| Yes      | Server timestamp when the action occurred. |

### Example Documents

```json
{
  "id": "hist_001",
  "userId": "aBcDeFgHiJkLmNoPqRsTuVwXyZ",
  "projectId": "proj_abc123def456",
  "action": "create_project",
  "details": "Created project 'Summer Vacation Reel' with aspect ratio 9:16.",
  "createdAt": "2025-06-01T10:00:00.000Z"
}
```

```json
{
  "id": "hist_002",
  "userId": "aBcDeFgHiJkLmNoPqRsTuVwXyZ",
  "projectId": "proj_abc123def456",
  "action": "render",
  "details": "Started render at 1080p, 30fps.",
  "createdAt": "2025-06-20T15:45:00.000Z"
}
```

### Security Rules Summary

- **Read**: Authenticated, `resource.data.userId == request.auth.uid`.
- **Create**: Authenticated, `request.resource.data.userId == request.auth.uid`.
- **Update**: Denied (append-only log).
- **Delete**: Denied (audit trail preservation).

---

## 6. `renderJobs/{renderId}`

Tracks the lifecycle of each video render request. Jobs are created by users and
updated by backend Cloud Functions as the render progresses.

### Fields

| Field        | Type       | Required | Description |
|--------------|------------|:--------:|-------------|
| `id`         | `string`   | Yes      | Unique job identifier (matches document ID). |
| `userId`     | `string`   | Yes      | Owner's Firebase Auth UID. |
| `projectId`  | `string`   | Yes      | The project being rendered. |
| `status`     | `string`   | Yes      | Job status. One of: `"pending"`, `"processing"`, `"completed"`, `"failed"`. |
| `progress`   | `number`   | Yes      | Render progress (0 – 100). |
| `downloadUrl`| `string`   | No       | Signed URL to download the rendered video (set on completion). |
| `resolution` | `string`   | Yes      | Render resolution (`"720p"`, `"1080p"`, `"1440p"`, `"4K"`). |
| `createdAt`  | `timestamp`| Yes      | Server timestamp when the job was created. |
| `completedAt`| `timestamp`| No       | Server timestamp when the job finished (completed or failed). |
| `error`      | `string`   | No       | Error message if the render failed. |

### Example Documents

**Pending job (just created):**

```json
{
  "id": "render_001",
  "userId": "aBcDeFgHiJkLmNoPqRsTuVwXyZ",
  "projectId": "proj_abc123def456",
  "status": "pending",
  "progress": 0,
  "downloadUrl": null,
  "resolution": "1080p",
  "createdAt": "2025-06-20T15:45:00.000Z",
  "completedAt": null,
  "error": null
}
```

**Completed job:**

```json
{
  "id": "render_001",
  "userId": "aBcDeFgHiJkLmNoPqRsTuVwXyZ",
  "projectId": "proj_abc123def456",
  "status": "completed",
  "progress": 100,
  "downloadUrl": "https://storage.example.com/renders/summer-reel-1080p.mp4?token=...",
  "resolution": "1080p",
  "createdAt": "2025-06-20T15:45:00.000Z",
  "completedAt": "2025-06-20T15:46:30.000Z",
  "error": null
}
```

**Failed job:**

```json
{
  "id": "render_002",
  "userId": "aBcDeFgHiJkLmNoPqRsTuVwXyZ",
  "projectId": "proj_abc123def456",
  "status": "failed",
  "progress": 45,
  "downloadUrl": null,
  "resolution": "4K",
  "createdAt": "2025-06-20T16:00:00.000Z",
  "completedAt": "2025-06-20T16:01:12.000Z",
  "error": "FFmpeg exited with code 1: Insufficient memory for 4K encoding."
}
```

### Security Rules Summary

- **Read**: Authenticated, `resource.data.userId == request.auth.uid`.
- **Create**: Authenticated, owner, `status == "pending"`, valid `resolution`.
- **Update**: Authenticated, owner, only when status is `"completed"` or `"failed"` (user cleanup).
- **Delete**: Authenticated, owner, only when status is `"completed"` or `"failed"`.

---

## Relationships Between Collections

```
users/{userId}
  └── projects/{projectId}    (1:N — a user has many projects)
  └── settings/{settingsId}   (1:1 — one settings doc per user)
  └── history/{historyId}     (1:N — a user has many history entries)
  └── renderJobs/{renderId}   (1:N — a user has many render jobs)

projects/{projectId}
  └── renderJobs/{renderId}   (1:N — a project can have multiple render jobs)
  └── history/{historyId}     (1:N — a project generates many history entries)

templates/{templateId}
  └── (standalone — no foreign keys to other collections)
  └── projects reference templates conceptually but do not store templateId
```

### Foreign Key Conventions

- `projects.userId` → `users.uid`
- `history.userId` → `users.uid`
- `history.projectId` → `projects.id`
- `renderJobs.userId` → `users.uid`
- `renderJobs.projectId` → `projects.id`

No hard foreign-key constraints exist in Firestore; referential integrity is
maintained at the application layer.

---

## Composite Indexes

These indexes are defined in `firestore.indexes.json` and are required for
performant queries. Deploy them with `firebase deploy --only firestore:indexes`.

| Collection   | Fields                              | Purpose |
|--------------|-------------------------------------|---------|
| `projects`   | `userId` ASC, `updatedAt` DESC      | List a user's projects sorted by last edited. |
| `projects`   | `userId` ASC, `createdAt` DESC      | List a user's projects sorted by newest first. |
| `projects`   | `userId` ASC, `name` ASC             | Search a user's projects by name. |
| `history`    | `userId` ASC, `createdAt` DESC      | Paginated activity feed for a user. |
| `templates`  | `category` ASC, `downloadCount` DESC| Browse templates by category, sorted by popularity. |
| `templates`  | `isPremium` ASC, `rating` DESC       | Filter free vs. premium templates sorted by rating. |
| `renderJobs`  | `userId` ASC, `createdAt` DESC       | List a user's render jobs newest first. |

### Single-Field Indexes (auto-created by Firestore)

Firestore automatically creates single-field indexes for every field. The
following exemptions are notable:

- `projects.images` — array elements are not individually indexed. Use a
  separate metadata field if you need to query by image count.
- `projects.texts` — same as above.
- `templates.tags` — Firestore does not support array-contains-queries on
  multiple elements in a single query. Use `array-contains` for a single tag.

---

## Subcollections

GIODAI does **not** use Firestore subcollections in the current schema. All data
is stored in top-level collections with `userId` scoping. If the schema grows to
require subcollections (e.g., `projects/{projectId}/comments`), security rules
would need to be extended accordingly.

---

## Document Size Limits

Firestore imposes a **1 MiB** per-document limit. GIODAI enforces a tighter
**256 KiB** limit in security rules for all write operations. Projects with
many images or text overlays should monitor document size and consider splitting
large projects into subcollections if the limit is approached.

Estimated sizes:
- Simple project (5 images, 2 texts): ~3–5 KiB
- Complex project (20 images, 10 texts): ~10–15 KiB
- Maximum safe images before approaching limit: ~200–300 images per project

---

## Deployment

```bash
# Deploy all Firestore rules, indexes, and hosting config
firebase deploy

# Deploy only Firestore rules
firebase deploy --only firestore:rules

# Deploy only Firestore indexes
firebase deploy --only firestore:indexes

# Deploy only hosting
firebase deploy --only hosting
```
