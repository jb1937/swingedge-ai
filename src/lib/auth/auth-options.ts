// src/lib/auth/auth-options.ts

import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

// In production, this would be stored in a database
// For now, we use an in-memory store with a default user
const users: Map<string, { id: string; email: string; name: string; passwordHash: string }> = new Map();

// Get password from environment variable for security
const authPassword = process.env.AUTH_PASSWORD;
if (!authPassword) {
  console.warn('WARNING: AUTH_PASSWORD environment variable is not set. Authentication will fail.');
}

// Create a default user on startup with password from environment variable
const defaultUser = {
  id: '1',
  email: 'trader@swingedge.ai',
  name: 'SwingEdge Trader',
  passwordHash: authPassword ? bcrypt.hashSync(authPassword, 10) : '',
};
users.set(defaultUser.email, defaultUser);

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email', placeholder: 'trader@swingedge.ai' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Please enter email and password');
        }

        const user = users.get(credentials.email);
        
        if (!user) {
          throw new Error('No user found with this email');
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        
        if (!isValid) {
          throw new Error('Invalid password');
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || 'development-secret-change-in-production',
};

// Helper function to register a new user (for demo purposes)
export async function registerUser(email: string, password: string, name: string): Promise<boolean> {
  if (users.has(email)) {
    return false;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const id = (users.size + 1).toString();
  
  users.set(email, { id, email, name, passwordHash });
  return true;
}

// Helper to verify if user exists
export function userExists(email: string): boolean {
  return users.has(email);
}
