import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// How long findBy* waits for something to appear before it decides it is not there.
//
// The library's own default is one second (@testing-library/dom 10.4.1, dist/config.js), and this
// project had never chosen a value, so that default was in force. It is a developer laptop's
// number: the three tests in AppShell.session-race.test.tsx finish in 665ms on this host. The
// Coding checks do not run on a laptop. They run inside a container that shares its CPU with eight
// others, and there that file crossed the second twice in one run - 5,609ms, "Unable to find
// role=heading and name 회원 관리" - while the same commit passed on another day. The approver was
// told "AI 가 만든 화면이 검사를 통과하지 못했습니다" about a screen the change never touched.
//
// Raising it weakens no test. A heading that never arrives still never arrives, and the test still
// fails - four seconds later rather than one. Only a heading that was going to arrive is saved.
//
// Four, not five: Vitest gives a single test five seconds (measured on this host, 5,016ms). If both
// clocks ran out together the failure would read "test timed out", which names nothing, instead of
// naming the element that never appeared. The message is how today's diagnosis was possible at all.
configure({ asyncUtilTimeout: 4000 })

// Testing Library unmounts automatically only when Vitest globals are enabled, and this project
// keeps them off. Without this, every render stays in the document and later queries match elements
// left behind by earlier tests.
afterEach(cleanup)
