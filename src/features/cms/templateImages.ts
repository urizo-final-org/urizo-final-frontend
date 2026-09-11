import type { SiteTemplate, TemplateHeroImage } from './api'

export const MAX_TEMPLATE_IMAGES = 5

export function templateImages(template: Pick<SiteTemplate, 'heroImageUrl' | 'heroImageUrls' | 'heroImages'>): string[] {
  return templateImageDetails(template).map((image) => image.url)
}

export function templateImageDetails(template: Pick<SiteTemplate, 'heroImageUrl' | 'heroImageUrls' | 'heroImages'>): TemplateHeroImage[] {
  return template.heroImages ?? (template.heroImageUrls ?? (template.heroImageUrl ? [template.heroImageUrl] : []))
    .map((url) => ({ url, title: '', description: '' }))
}

export function withTemplateImages(template: SiteTemplate, images: TemplateHeroImage[]): SiteTemplate {
  return { ...template, heroImages: images, heroImageUrls: images.map((image) => image.url), heroImageUrl: images[0]?.url ?? '' }
}

export function templateLabel(key: string) {
  return ({ BOLD: '템플릿 1', CLASSIC: '템플릿 2', MINIMAL: '템플릿 3' } as Record<string, string>)[key] ?? key
}
