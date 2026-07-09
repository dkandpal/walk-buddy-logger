/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'

const WalkReminder = () => (
  <html lang="en">
    <head />
    <body>
      <h1>Kerberos loves you 🐾</h1>
      <p>It's been about 5 hours since his last walk.</p>
    </body>
  </html>
)

export const template = {
  component: WalkReminder,
  subject: 'Kerberos loves you',
  displayName: 'Walk Reminder',
  previewData: {},
} satisfies TemplateEntry
