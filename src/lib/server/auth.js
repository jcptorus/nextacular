import { PrismaAdapter } from '@next-auth/prisma-adapter';
import EmailProvider from 'next-auth/providers/email';

import prisma from '@/prisma/index';
import { html, text } from '@/config/email-templates/signin';
import { emailConfig, sendMail } from '@/lib/server/mail';
import { createPaymentAccount, getPayment } from '@/prisma/services/customer';

const isProd = process.env.NODE_ENV === 'production';

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  callbacks: {
    session: async ({ session, user }) => {
      if (session.user) {
        const customerPayment = await getPayment(user.email);
        session.user.userId = user.id;

        if (customerPayment) {
          session.user.subscription = customerPayment.subscriptionType;
        }
      }

      return session;
    },
  },
  debug: !isProd,
  events: {
    signIn: async ({ user, isNewUser }) => {
      const customerPayment = await getPayment(user.email);

      if (isNewUser || customerPayment === null || user.createdAt === null) {
        await Promise.all([createPaymentAccount(user.email, user.id)]);
      }
    },
  },
  providers: [
    EmailProvider({
      from: process.env.EMAIL_FROM,
      server: emailConfig,

      // 👇 ICI : hack dev pour Bolt
      async sendVerificationRequest({ identifier: email, url }) {
        if (!isProd) {
          // MODE DEV (Bolt) : on LOG le lien au lieu d’envoyer un mail
          console.log('========== MAGIC LOGIN LINK ==========');
          console.log('Email demandé :', email);
          console.log('URL de connexion :', url);
          console.log('======================================');
          return;
        }

        // MODE PROD : comportement normal (envoi d’email)
        const { host } = new URL(url);
        await sendMail({
          html: html({ email, url }),
          subject: `[Nextacular] Sign in to ${host}`,
          text: text({ email, url }),
          to: email,
        });
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET || null,
  session: {
    jwt: true,
  },
};
