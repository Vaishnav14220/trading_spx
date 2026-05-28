# 🔧 Fix Capital.com Credentials Issue

## ❌ Current Problem

The error `{"errorCode":"error.invalid.details"}` means the **username/email is incorrect**.

Currently set:
- **CAPITAL_IDENTIFIER**: `your-email@example.com`
- **CAPITAL_PASSWORD**: `your-password`
- **CAPITAL_API_KEY**: `your-api-key`

## ✅ What You Need

You need your **Capital.com login email or username** (the one you use to log into the Capital.com website).

### Example:
- Email: `your-email@gmail.com`
- Username: `your_username`

## 🔧 How to Fix

### Step 1: Find Your Capital.com Login Email/Username

1. Go to https://capital.com
2. Look at what you use to login - that's your identifier
3. It should be an **email address** or **username**

### Step 2: Update Netlify Environment Variables

Once you have your correct email/username, run these commands:

```bash
# Update the identifier with your ACTUAL email or username
netlify env:set CAPITAL_IDENTIFIER "your-actual-email@example.com"

# Verify password is correct
netlify env:set CAPITAL_PASSWORD "your-password"

# Verify API key is correct
netlify env:set CAPITAL_API_KEY "your-api-key"

# Redeploy
netlify deploy --prod
```

### Step 3: Test

After redeploying, visit:
- **Main app**: https://spx-trading-app.netlify.app
- **Test page**: https://spx-trading-app.netlify.app/test-auth.html

## 📝 Quick Fix Command Template

Replace `YOUR_EMAIL_HERE` with your actual Capital.com login email:

```bash
netlify env:set CAPITAL_IDENTIFIER "YOUR_EMAIL_HERE"
netlify deploy --prod
```

## 🆘 Still Not Working?

If you're still getting errors after setting the correct email:

1. **Verify your credentials work** by logging into https://capital.com manually
2. **Check if your API key is activated** in Capital.com dashboard
3. **Make sure you're using the correct API key** (demo vs live)
4. **Check if your account has API access enabled**

## 📧 What is the Identifier?

The identifier is **ONE** of these:
- ✅ Your email: `john.doe@gmail.com`
- ✅ Your username: `johndoe123`
- ❌ NOT your password
- ❌ NOT your API key

## 🔐 Capital.com Login Credentials

You need:
1. **Email/Username** (identifier) - What you type in the "Email" or "Username" field when logging in
2. **Password** - Your account password
3. **API Key** - From Capital.com API settings (different from login password)

---

**Please provide your Capital.com login email/username so I can update the environment variables correctly!**
