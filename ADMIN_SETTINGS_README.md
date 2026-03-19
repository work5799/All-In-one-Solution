# Admin Settings System Documentation

## Overview

The Admin Settings System provides comprehensive control over page access, password protection, and daily usage limits for the AI Image Generator and Watermark Remover website.

## Features

### 1. Page Lock System

**Location:** Admin Settings → Page Access Control Tab

#### Features:
- **Master Lock Switch**: Enable/disable password protection globally
- **Page Selection**: Choose which pages to lock individually
- **Session-based Unlocking**: Once unlocked, pages remain accessible during the browser session

#### Lockable Pages:
- Dashboard (`/`)
- AI Image Generator (`/ai-generator`)
- Watermark Remover (`/watermark-remover`)
- Image Optimizer (`/image-optimizer`)
- Video Optimizer (`/video-optimizer`)
- Image Resizer (`/image-resizer`)
- Watermark Adder (`/watermark`)
- History (`/history`)

#### How It Works:
1. Enable the Master Lock Switch
2. Toggle individual pages to lock them
3. Users attempting to access locked pages see a password screen
4. After entering the correct password, the page unlocks for the session

---

### 2. Password Management

**Location:** Admin Settings → Passwords Tab

#### Master Password
- Default password applied to all locked pages
- Minimum 4 characters required
- Can be changed anytime

#### Page-Specific Passwords (Optional)
- Override the master password for individual pages
- Useful for granting different access levels
- Can be set/removed independently

#### Password Screen Features:
- Clean, modern UI with animations
- Real-time error feedback
- Success confirmation before redirect
- "Go Back" option

---

### 3. Usage Limit System

**Location:** Admin Settings → Usage Limits Tab

#### Configuration Options:

**Enable Usage Limits**
- Toggle tracking and limiting on/off
- When disabled, users have unlimited access

**Automatic Daily Reset**
- Resets all usage counters at midnight
- Each day starts fresh (0/limit)
- Configurable reset hour

**Per-Service Limits**
- Separate limits for each tool
- Individual tracking per service

#### Default Daily Limits:
| Service | Default Limit |
|---------|--------------|
| Image Optimizer | 50 uses/day |
| AI Generator | 20 uses/day |
| Video Optimizer | 25 uses/day |
| Image Resizer | 50 uses/day |
| Watermark Adder | 40 uses/day |
| Watermark Remover | 10 uses/day |
| Downloads | 100 downloads/day |

#### When Limit Reached:
- User is blocked from using the tool
- Error toast notification appears
- Message: "You have reached your daily limit. Please try again tomorrow."
- Automatic reset at midnight

---

### 4. Member Management

**Location:** Admin Settings → Members Tab

#### Features:

**Analytics Overview**
- Total users count
- Active users (used at least one service)
- Inactive users
- Average usage statistics

**User Usage Table**
- View all users and their usage
- Per-service usage with progress bars
- Remaining uses displayed
- Last reset date shown

**Admin Actions:**
- **Reset User Usage**: Reset counters for a specific user
- **Reset All Usage**: Reset counters for all users
- **Search Users**: Find users by ID
- **View Statistics**: See percentage usage per service

---

## Technical Implementation

### File Structure

```
src/
├── lib/
│   ├── pageLock.ts              # Page lock system logic
│   └── memberLimitsEnhanced.ts  # Enhanced usage tracking
├── components/
│   ├── PasswordProtectionScreen.tsx  # Password entry UI
│   ├── PageLockGuard.tsx        # Route protection wrapper
│   ├── AdminSettingsPanel.tsx   # Main admin panel
│   └── UsageLimitWarning.tsx    # Usage display component
├── hooks/
│   └── useUsageLimit.ts         # Usage limit React hook
└── pages/
    └── AdminSettingsPage.tsx    # Admin settings page
```

### Storage Keys

All data is stored in `localStorage`:

| Key | Purpose |
|-----|---------|
| `imgopt_page_lock` | Page lock configuration |
| `imgopt_page_password` | Password configurations |
| `imgopt_unlocked_pages` | Session-based unlocked pages |
| `imgopt_member_limits` | Service limits |
| `imgopt_member_limits_config` | Limits configuration |
| `imgopt_member_usage_[userId]` | Per-user usage tracking |

### Automatic Daily Reset

The system automatically resets usage when:
1. Date changes (compared to `lastResetDate`)
2. User accesses any protected service
3. Reset occurs at midnight server time

Usage history is preserved for 30 days for analytics.

---

## Usage Examples

### For Administrators

#### Setting Up Page Lock:
1. Navigate to Settings → Admin Settings Panel → Open Admin Panel
2. Go to "Page Access" tab
3. Enable "Master Lock Switch"
4. Toggle pages you want to lock
5. Go to "Passwords" tab to set custom passwords (optional)

#### Configuring Usage Limits:
1. Navigate to "Usage Limits" tab
2. Enable "Usage Limits" toggle
3. Enable "Automatic Daily Reset"
4. Adjust per-service limits using sliders or input fields
5. Click "Save Usage Limits"

#### Managing Members:
1. Navigate to "Members" tab
2. View all users and their usage statistics
3. Use search to find specific users
4. Click reset icon to reset individual user
5. Use "Reset All Usage" for global reset

### For Developers

#### Using the Usage Limit Hook:

```typescript
import { useUsageLimit } from "@/hooks/useUsageLimit";

function MyComponent() {
  const { 
    checkUsage, 
    consumeUsage, 
    isLimitReached, 
    usage, 
    limit, 
    remaining 
  } = useUsageLimit({ 
    service: "ai-generator",
    showToast: true,
    onLimitReached: () => {
      // Custom handling when limit reached
    }
  });

  const handleGenerate = async () => {
    const result = consumeUsage(1);
    if (!result.ok) {
      // Limit reached, show error
      return;
    }
    // Proceed with generation
  };

  return (
    <div>
      <p>Usage: {usage}/{limit}</p>
      <p>Remaining: {remaining}</p>
    </div>
  );
}
```

#### Checking Page Lock Status:

```typescript
import { isPageLocked, isPageUnlockedInSession } from "@/lib/pageLock";

// Check if page is locked
const locked = isPageLocked("ai-generator");

// Check if already unlocked in session
const unlocked = isPageUnlockedInSession("ai-generator");

// Manually unlock page (after password verification)
import { unlockPageInSession } from "@/lib/pageLock";
unlockPageInSession("ai-generator");
```

---

## Security Considerations

### Current Implementation (Client-Side)

⚠️ **Important**: This system uses `localStorage` for storage, which is suitable for single-user or trusted environments but NOT for production multi-user applications.

#### Limitations:
- Passwords stored in plain text in localStorage
- Usage counters can be reset by clearing browser data
- No server-side validation
- Single-device tracking only

#### Recommendations for Production:

1. **Move to Server-Side Storage**
   - Use Supabase or similar backend
   - Store passwords hashed (bcrypt)
   - Implement proper authentication

2. **Database Schema Suggestion**:
   ```sql
   CREATE TABLE users (
     id UUID PRIMARY KEY,
     username TEXT UNIQUE,
     password_hash TEXT,
     role TEXT DEFAULT 'member',
     created_at TIMESTAMP
   );

   CREATE TABLE usage_tracking (
     user_id UUID REFERENCES users,
     service TEXT,
     daily_count INTEGER DEFAULT 0,
     last_reset DATE,
     PRIMARY KEY (user_id, service, last_reset)
   );

   CREATE TABLE page_access (
     page_id TEXT PRIMARY KEY,
     is_locked BOOLEAN DEFAULT false,
     password_hash TEXT
   );
   ```

3. **API Endpoints Needed**:
   - `POST /api/auth/verify-password`
   - `POST /api/usage/consume`
   - `GET /api/usage/status`
   - `POST /api/admin/reset-usage`
   - `GET /api/admin/analytics`

---

## API Reference

### Page Lock Functions

```typescript
// Configuration
getPageLockConfig(): PageLockConfig
savePageLockConfig(config: PageLockConfig)
setPageLockEnabled(enabled: boolean)
isPageLocked(pageId: string): boolean
togglePageLock(pageId: string, locked: boolean)

// Passwords
getMasterPassword(): string
setMasterPassword(password: string)
getPagePassword(pageId: string): string
setPagePassword(pageId: string, password: string)
verifyPagePassword(pageId: string, password: string): boolean

// Session Management
isPageUnlockedInSession(pageId: string): boolean
unlockPageInSession(pageId: string)
clearUnlockedPages()
```

### Member Limits Functions

```typescript
// Configuration
getMemberLimitsConfig(): MemberLimitsConfig
saveMemberLimitsConfig(config: MemberLimitsConfig)
getMemberLimits(): MemberLimits
saveMemberLimits(limits: MemberLimits)

// Usage Tracking
getMemberUsage(userId?: string): MemberUsage
saveMemberUsage(usage: MemberUsage, userId?: string)
resetMemberUsage(userId?: string): MemberUsage
consumeServiceUsage(service: ServiceKey, amount: number, userId?: string): LimitResult
consumeDownloadUsage(amount: number, userId?: string): LimitResult
checkServiceUsageAllowed(service: ServiceKey, userId?: string): LimitResult

// Admin Functions
getAllUsersUsage(): UserUsageStats[]
adminResetUserUsage(userId: string): MemberUsage
adminResetAllUsage(): number
getUsageAnalytics(): AnalyticsData
```

---

## Troubleshooting

### Common Issues

**Page lock not working:**
- Ensure Master Lock Switch is enabled
- Check that specific page is toggled on
- Clear browser cache and try again

**Usage not resetting:**
- Check "Automatic Daily Reset" is enabled
- Verify system date/time is correct
- Check localStorage for corrupted data

**Password not accepted:**
- Verify master password is set correctly
- Check for case sensitivity
- Try resetting password in admin panel

**Usage counters not updating:**
- Ensure "Enable Usage Limits" is toggled on
- Check browser console for errors
- Verify localStorage is not disabled

---

## Future Enhancements

### Planned Features:
- [ ] Server-side validation with Supabase
- [ ] User registration and authentication
- [ ] Role-based access control (Admin/Member/Guest)
- [ ] Email notifications for limit warnings
- [ ] Custom limit periods (weekly, monthly)
- [ ] Usage analytics dashboard with charts
- [ ] Export usage reports to CSV
- [ ] API rate limiting
- [ ] IP-based access control
- [ ] Two-factor authentication for admin

---

## Support

For issues or questions:
1. Check this documentation first
2. Review browser console for errors
3. Verify localStorage data integrity
4. Test in incognito mode to rule out cache issues

---

**Version:** 1.0.0  
**Last Updated:** March 2026
