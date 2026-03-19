# Admin Settings - Quick Start Guide

## 🚀 Quick Setup (5 Minutes)

### Step 1: Access Admin Settings
1. Login to the application (default: admin/admin123)
2. Navigate to **Settings** page
3. Click **"Open Admin Panel"** button

---

### Step 2: Set Up Page Lock (Optional)

**Want to password-protect pages?**

1. Go to **Page Access** tab
2. Toggle **Master Lock Switch** → ON
3. Select pages to lock:
   - ✅ AI Image Generator
   - ✅ Watermark Remover
   - ✅ Dashboard (optional)
4. Go to **Passwords** tab
5. Change **Master Password** from default
6. (Optional) Set different passwords for specific pages

**Done!** Visitors now need a password to access locked pages.

---

### Step 3: Configure Usage Limits

**Want to limit daily usage?**

1. Go to **Usage Limits** tab
2. Toggle **Enable Usage Limits** → ON
3. Toggle **Automatic Daily Reset** → ON
4. Set daily limits:
   ```
   AI Generator: 20 uses/day
   Watermark Remover: 10 uses/day
   Image Optimizer: 50 uses/day
   Downloads: 100/day
   ```
5. Click **Save Usage Limits**

**Done!** Users are now limited to daily usage.

---

### Step 4: Monitor Usage

**Check who's using what:**

1. Go to **Members** tab
2. View all users and their usage
3. See remaining uses per service
4. Reset individual users if needed

---

## 🔐 Default Passwords

| Type | Default | Change Immediately? |
|------|---------|---------------------|
| Login Password | `admin123` | ✅ YES |
| Page Lock Master | `admin123` | ✅ YES |

**To change login password:**
- Settings → Change Password section

**To change page lock password:**
- Admin Settings → Passwords tab

---

## 📊 Common Scenarios

### Scenario 1: Free Tier with Limits
```
Enable Usage Limits: ON
AI Generator: 5/day (free tier)
Watermark Remover: 3/day (free tier)
Reset: Daily at midnight
```

### Scenario 2: Premium No Limits
```
Enable Usage Limits: OFF
All tools: Unlimited
```

### Scenario 3: Mixed Access
```
Page Lock: ON
- Public pages: Dashboard, Image Resizer
- Locked pages: AI Generator (password: "premium2024")
- Watermark Remover (password: "premium2024")
```

### Scenario 4: Trial Period
```
Usage Limits: ON
AI Generator: 20/day (trial limit)
Watermark Remover: 10/day (trial limit)
Monitor usage in Members tab
Upgrade to remove limits
```

---

## ⚠️ Important Notes

1. **Storage is Local**: Data stored in browser localStorage
   - Clearing browser data resets everything
   - Not suitable for production multi-user without backend

2. **Daily Reset**: Happens automatically at midnight
   - Based on user's local time
   - Can be manual reset by admin

3. **Password Security**: Currently client-side only
   - Change default passwords immediately
   - Not secure for high-security needs

---

## 🎯 Quick Actions

### Reset a User's Usage
1. Members tab
2. Find user in table
3. Click ↻ (reset) icon
4. Confirm

### Reset Everyone's Usage
1. Members tab
2. Click **"Reset All Usage"** button
3. Confirm action

### Change Page Password
1. Passwords tab
2. Find the page
3. Click "Change Password"
4. Enter new password
5. Save

### Disable All Limits Temporarily
1. Usage Limits tab
2. Toggle **"Enable Usage Limits"** → OFF
3. All users get unlimited access
4. Toggle back ON to re-enable

---

## 📱 Mobile Access

Admin panel is fully responsive:
- Works on tablets and phones
- Touch-friendly controls
- Collapsible sections
- Easy navigation

---

## 🆘 Need Help?

**Check:**
1. Is Master Lock enabled? (Page Access tab)
2. Are limits enabled? (Usage Limits tab)
3. Browser console for errors (F12)
4. ADMIN_SETTINGS_README.md for details

---

## ✅ Setup Checklist

Before going live:

- [ ] Changed default login password
- [ ] Changed default page lock password
- [ ] Set appropriate usage limits
- [ ] Enabled automatic daily reset
- [ ] Tested password protection on locked pages
- [ ] Verified usage tracking works
- [ ] Tested admin reset functions

**You're all set!** 🎉
