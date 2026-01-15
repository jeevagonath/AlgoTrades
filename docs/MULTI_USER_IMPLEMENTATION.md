# Multi-User Support - Complete Implementation Plan

## Table of Contents
1. [Overview](#overview)
2. [Database Migration](#database-migration)
3. [Supabase Authentication](#supabase-authentication)
4. [Shoonya Credentials Storage](#shoonya-credentials-storage)
5. [Backend Implementation](#backend-implementation)
6. [Frontend Implementation](#frontend-implementation)
7. [Testing & Deployment](#testing--deployment)

---

## Overview

Transform the single-user AlgoTrades platform into a multi-user system where each user has:
- ✅ Isolated strategy settings
- ✅ Separate Shoonya broker accounts
- ✅ Independent positions and PnL
- ✅ Personal trade history
- ✅ Auto-reconnect to Shoonya

**Timeline**: 7-8 days  
**Authentication**: Supabase Auth + Encrypted Shoonya credentials

---

## Database Migration

### Step 1: Add Shoonya Credentials to broker_session

```sql
-- Add user_id and Shoonya credentials
ALTER TABLE broker_session ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE broker_session ADD COLUMN shoonya_user_id TEXT;
ALTER TABLE broker_session ADD COLUMN shoonya_password TEXT;  -- Encrypted
ALTER TABLE broker_session ADD COLUMN vendor_code TEXT;
ALTER TABLE broker_session ADD COLUMN api_key TEXT;
ALTER TABLE broker_session ADD COLUMN imei TEXT;

-- Change primary key
ALTER TABLE broker_session DROP CONSTRAINT IF EXISTS broker_session_pkey;
ALTER TABLE broker_session ADD PRIMARY KEY (user_id);
ALTER TABLE broker_session DROP COLUMN IF EXISTS id;
```

### Step 2: Add user_id to All Tables

```sql
-- Strategy state
ALTER TABLE strategy_state ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE strategy_state DROP CONSTRAINT IF EXISTS strategy_state_pkey;
ALTER TABLE strategy_state ADD PRIMARY KEY (user_id);
ALTER TABLE strategy_state DROP COLUMN IF EXISTS id;

-- Positions
ALTER TABLE positions ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_positions_user_id ON positions(user_id);

-- Trade history
ALTER TABLE trade_history ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_trade_history_user_id ON trade_history(user_id);

-- Position history log
ALTER TABLE position_history_log ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- System logs
ALTER TABLE system_logs ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX idx_system_logs_user_id ON system_logs(user_id);

-- Order book
ALTER TABLE order_book ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_order_book_user_id ON order_book(user_id);

-- Alerts
ALTER TABLE alerts ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_alerts_user_id ON alerts(user_id);

-- Manual expiry settings
ALTER TABLE manual_expiry_settings ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE manual_expiry_settings DROP CONSTRAINT IF EXISTS manual_expiry_settings_pkey;
ALTER TABLE manual_expiry_settings ADD PRIMARY KEY (user_id);
ALTER TABLE manual_expiry_settings DROP COLUMN IF EXISTS id;
```

### Step 3: Enable Row Level Security

```sql
-- Enable RLS on all tables
ALTER TABLE strategy_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_session ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Create policies (users can only access their own data)
CREATE POLICY strategy_state_user_policy ON strategy_state
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY positions_user_policy ON positions
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY broker_session_user_policy ON broker_session
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY trade_history_user_policy ON trade_history
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY system_logs_user_policy ON system_logs
    FOR ALL USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY order_book_user_policy ON order_book
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY alerts_user_policy ON alerts
    FOR ALL USING (user_id = auth.uid());
```

---

## Supabase Authentication

### Step 1: Enable in Dashboard

1. Go to Supabase Dashboard → Authentication → Settings
2. Enable Email authentication
3. Disable email confirmations (or configure SMTP)
4. Set site URL: `https://your-app.com`
5. Add redirect URLs for localhost

### Step 2: Backend Auth Middleware

**File**: `backend/src/middleware/auth.middleware.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../services/supabase.service';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
    };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        
        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error } = await supabase.auth.getUser(token);
        
        if (error || !user) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        req.user = { id: user.id, email: user.email! };
        next();
    } catch (error) {
        res.status(401).json({ error: 'Authentication failed' });
    }
};
```

### Step 3: Auth Routes

**File**: `backend/src/routes/auth.routes.ts`

```typescript
import { Router } from 'express';
import { supabase } from '../services/supabase.service';

const router = Router();

router.post('/register', async (req, res) => {
    const { email, password, name } = req.body;
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } }
    });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, user: data.user, session: data.session });
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return res.status(401).json({ error: error.message });
    res.json({ success: true, token: data.session.access_token, user: data.user });
});

router.post('/logout', async (req, res) => {
    const { error } = await supabase.auth.signOut();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true });
});

export default router;
```

---

## Shoonya Credentials Storage

### Encryption Utility

**File**: `backend/src/utils/encryption.ts`

```typescript
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!; // 32 bytes hex
const IV_LENGTH = 16;

export function encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift()!, 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
}
```

### Broker Service

**File**: `backend/src/services/broker.service.ts`

```typescript
import { encrypt, decrypt } from '../utils/encryption';
import { supabase } from './supabase.service';
import { shoonya } from './shoonya.service';

export const brokerService = {
    async saveCredentials(userId: string, credentials: {
        shoonyaUserId: string;
        password: string;
        vendorCode: string;
        apiKey: string;
        imei: string;
    }) {
        const encryptedPassword = encrypt(credentials.password);
        
        await supabase.from('broker_session').upsert({
            user_id: userId,
            shoonya_user_id: credentials.shoonyaUserId,
            shoonya_password: encryptedPassword,
            vendor_code: credentials.vendorCode,
            api_key: credentials.apiKey,
            imei: credentials.imei
        });
        
        // Auto-login
        const loginResult = await shoonya.login(credentials);
        
        await supabase.from('broker_session').update({
            uid: loginResult.uid,
            susertoken: loginResult.susertoken,
            actid: loginResult.actid
        }).eq('user_id', userId);
        
        return loginResult;
    },
    
    async autoReconnect(userId: string) {
        const { data } = await supabase
            .from('broker_session')
            .select('*')
            .eq('user_id', userId)
            .single();
            
        if (!data) throw new Error('No saved credentials');
        
        const password = decrypt(data.shoonya_password);
        
        const loginResult = await shoonya.login({
            userId: data.shoonya_user_id,
            password,
            vendorCode: data.vendor_code,
            apiKey: data.api_key,
            imei: data.imei
        });
        
        await supabase.from('broker_session').update({
            uid: loginResult.uid,
            susertoken: loginResult.susertoken,
            updated_at: new Date().toISOString()
        }).eq('user_id', userId);
        
        return loginResult;
    }
};
```

---

## Backend Implementation

### Engine Manager

**File**: `backend/src/services/strategy-engine-manager.ts`

```typescript
import { StrategyEngine } from './strategy.engine';

class StrategyEngineManager {
    private engines: Map<string, StrategyEngine> = new Map();
    
    getEngine(userId: string): StrategyEngine {
        if (!this.engines.has(userId)) {
            this.engines.set(userId, new StrategyEngine(userId));
        }
        return this.engines.get(userId)!;
    }
    
    removeEngine(userId: string) {
        this.engines.delete(userId);
    }
}

export const engineManager = new StrategyEngineManager();
```

### Update Strategy Engine

**File**: `backend/src/services/strategy.engine.ts`

```typescript
class StrategyEngine {
    private userId: string;
    
    constructor(userId: string) {
        this.userId = userId;
        this.loadUserState();
        this.initScheduler();
    }
    
    private async loadUserState() {
        const state = await db.getState(this.userId);
        if (state) {
            this.state = { ...this.state, ...state };
        }
    }
    
    private async syncToDb(forcePnl: boolean = false) {
        await db.updateState(this.userId, this.state);
        // ...
    }
}
```

### Protected Routes

**File**: `backend/src/routes/strategy.routes.ts`

```typescript
import { authenticate, AuthRequest } from '../middleware/auth.middleware';
import { engineManager } from '../services/strategy-engine-manager';

router.get('/state', authenticate, async (req: AuthRequest, res) => {
    const engine = engineManager.getEngine(req.user!.id);
    res.json(engine.getState());
});

router.post('/pause', authenticate, async (req: AuthRequest, res) => {
    const engine = engineManager.getEngine(req.user!.id);
    await engine.pause();
    res.json({ success: true });
});
```

---

## Frontend Implementation

### Auth Context

**File**: `frontend/src/contexts/AuthContext.tsx`

```typescript
import React, { createContext, useState, useContext } from 'react';

const AuthContext = createContext<any>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    
    const login = async (email: string, password: string) => {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('token', data.token);
    };
    
    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('token');
    };
    
    return (
        <AuthContext.Provider value={{ user, token, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
```

### API Calls with Auth

```typescript
const token = localStorage.getItem('token');
fetch('/api/strategy/state', {
    headers: { 'Authorization': `Bearer ${token}` }
});
```

---

## Testing & Deployment

### Testing Checklist

- [ ] User registration works
- [ ] User login returns token
- [ ] Protected routes require auth
- [ ] Each user gets own engine
- [ ] Data isolation works
- [ ] Shoonya credentials saved
- [ ] Auto-reconnect works
- [ ] Multiple users can trade simultaneously

### Deployment Steps

1. Backup database
2. Run migration scripts
3. Generate encryption key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. Add to `.env`: `ENCRYPTION_KEY=your-key`
5. Deploy backend
6. Deploy frontend
7. Test with 2+ users

---

## Environment Variables

```bash
# .env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-key
ENCRYPTION_KEY=your-64-char-hex-key
```

---

## Summary

✅ **Multi-user support** with Supabase Auth  
✅ **Encrypted Shoonya credentials** per user  
✅ **Auto-reconnect** to broker  
✅ **Row Level Security** for data isolation  
✅ **One engine instance** per user  
✅ **Complete data separation**  

**Timeline**: 7-8 days  
**Security**: AES-256 encryption + RLS  
**UX**: Login once, auto-reconnect to Shoonya
