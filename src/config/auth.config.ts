export default () => ({
  auth: {
    jwt: {
      secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    },
    bcrypt: {
      saltRounds: 10,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        'http://localhost:3001/api/auth/google/callback',
    },
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
});
