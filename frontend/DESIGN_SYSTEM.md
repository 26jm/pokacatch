# Poka-Catch Design System

## Identity

- Clean, Trustworthy, Modern, Dynamic C2C commerce interface
- Mobile-first two-column deal feed with K-pop purple accents

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| Primary | `#6C5CE7` | Brand, CTA, progress |
| Active | `#5B4BC4` | Hover / active |
| Light | `#A29BFE` | Accent |
| Background | `#F8F7FF` | Page and input background |
| Text | `#1F1F24` | Main text |
| Subtext | `#8E8E93` | Captions |
| Line | `#E5E5EA` | Borders |
| Verified | `#00B894` | AI receipt badge |

## Typography

- Korean: Pretendard, Noto Sans KR, system sans-serif
- Arabic: Cairo, Noto Sans Arabic, system sans-serif
- Headline 22px/700; section 18px/700; body 15px/500; caption 12px/400

## Component rules

- Deal card: square thumbnail, verification badge, price, participant progress and deadline.
- Search: 12px rounded input on light-purple background.
- Selected preference: 2px primary-purple border plus check mark.
- Arabic screen: set `lang="ar" dir="rtl"`; avoid left/right-only layout CSS and test directional icons.
