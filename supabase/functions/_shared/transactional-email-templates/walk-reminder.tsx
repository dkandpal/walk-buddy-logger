/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  hoursSinceWalk?: number
}

const WalkReminder = ({ hoursSinceWalk }: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Kerberos loves you</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Kerberos loves you 🐾</Heading>
        {typeof hoursSinceWalk === 'number' && (
          <Text style={text}>
            It's been about {hoursSinceWalk} hours since his last walk.
          </Text>
        )}
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WalkReminder,
  subject: 'Kerberos loves you',
  displayName: 'Walk Reminder',
  previewData: { hoursSinceWalk: 5 },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
}
const container = {
  padding: '40px 32px',
  maxWidth: '560px',
  margin: '0 auto',
}
const h1 = {
  color: 'hsl(220, 30%, 10%)',
  fontSize: '28px',
  fontWeight: '700' as const,
  margin: '0 0 16px',
}
const text = {
  color: 'hsl(220, 10%, 40%)',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0',
}
