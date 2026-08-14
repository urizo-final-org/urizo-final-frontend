import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library unmounts automatically only when Vitest globals are enabled, and this project
// keeps them off. Without this, every render stays in the document and later queries match elements
// left behind by earlier tests.
afterEach(cleanup)
