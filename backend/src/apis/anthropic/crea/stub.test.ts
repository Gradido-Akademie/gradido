import type { CreaContributionInput } from '@/graphql/input/CreaContributionInput'
import { SALUTATION_PLACEHOLDER, SIGNATURE_PLACEHOLDER } from './deterministics'
import { buildStubEvaluation, CREA_STUB_FLAG } from './stub'

const stubInput = (over: Partial<CreaContributionInput> = {}): CreaContributionInput =>
  ({ text: 'Ich habe im Tierheim geholfen.', ...over }) as CreaContributionInput

describe('crea stub preview evaluation', () => {
  it('carries the stub_preview flag so the UI can label it as a preview', () => {
    expect(buildStubEvaluation(stubInput()).flags).toContain(CREA_STUB_FLAG)
  })

  it('derives the activity hours from the entered GDD (1 h = 20 GDD)', () => {
    expect(buildStubEvaluation(stubInput({ enteredGdd: 200 })).activities[0].hours).toBe(10)
  })

  it('fills the salutation locally from a known male first name', () => {
    const result = buildStubEvaluation(stubInput({ recipientFirstName: 'Bernd' }))
    expect(result.responseText).toContain('Lieber Bernd')
    expect(result.responseText).not.toContain(SALUTATION_PLACEHOLDER)
  })

  it('flags an uncertain salutation for an unknown name (E-005)', () => {
    expect(buildStubEvaluation(stubInput({ recipientFirstName: 'Xyzzy' })).flags).toContain(
      'anrede_unsicher',
    )
  })

  it('fills the moderator signature when provided, keeps the placeholder otherwise', () => {
    const withSignature = buildStubEvaluation(stubInput({ moderatorSignature: 'Herzlich, Bernd' }))
    expect(withSignature.responseText).toContain('Herzlich, Bernd')
    expect(withSignature.responseText).not.toContain(SIGNATURE_PLACEHOLDER)

    expect(buildStubEvaluation(stubInput()).responseText).toContain(SIGNATURE_PLACEHOLDER)
  })

  it('returns a confirm verdict with schema-valid enum values', () => {
    const result = buildStubEvaluation(stubInput({ enteredGdd: 100 }))
    expect(result.overallVerdict).toBe('confirm')
    expect(result.activities[0].categoryKey).toBe('other')
    expect(result.activities[0].outputType).toBe('service')
  })
})
