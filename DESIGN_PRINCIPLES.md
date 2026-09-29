# Kitchen Hub design principles

## Visual hierarchy

- Use one accent color per active theme for primary actions, focus, and interactive states. Everything else stays within functional monochromatic shades.
- Give every view one obvious visual anchor.
- Maintain a disciplined type scale so headers alone communicate the page purpose and current state.

## Layout and composition

- Avoid uniform dashboard card grids. Prefer intentional, asymmetric composition.
- Separate groups with whitespace before adding borders or dividers.
- Give each component exactly one job.
- Design desktop-first with fluid rules. At 375px, content stacks with generous spacing, touch targets grow, and navigation collapses cleanly.

## Component states

Every data-dependent component must define ideal, loading, empty, and actionable error states. Loading states preserve final layout dimensions to avoid shifts. Empty states provide one primary action. Error states provide an immediate retry.

## Completion checks

- The view's purpose is clear within two seconds.
- Nothing is cramped or misaligned at 375px.
- Remove borders when whitespace can provide the needed separation.
- Polish transitions and keep padding consistent before considering a view complete.
