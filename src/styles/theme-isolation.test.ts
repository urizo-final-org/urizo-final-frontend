import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cwd } from 'node:process'
import { expect, test } from 'vitest'

const adminTheme = readFileSync(resolve(cwd(), 'src/styles/admin-theme.css'), 'utf8')
const siteTheme = readFileSync(resolve(cwd(), 'src/styles/site-theme.css'), 'utf8')

test('admin and site theme entrypoints remain root-scoped', () => {
  expect(adminTheme).toContain(".admin-app[data-admin-theme='dark']")
  expect(siteTheme).toContain('.site-app')
  expect(adminTheme).not.toMatch(/(^|})\s*(?:body|button|input|select|textarea|h[1-6])(?:\s|,|\{|:)/m)
  expect(siteTheme).not.toContain('[data-admin-theme')
})
