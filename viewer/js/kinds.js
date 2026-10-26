// How the viewer names things per source kind (atlas.project.kind). Unknown or missing kinds read as a website.
export const KINDS = {
  web: { label: 'Website', screens: 'screens', screen: 'Screen', vars: 'CSS variables' },
  file: { label: 'Local HTML/SVG', screens: 'pages', screen: 'Page', vars: 'CSS variables' },
  storybook: { label: 'Storybook', screens: 'stories', screen: 'Story', vars: 'CSS variables' },
  pptx: { label: 'PowerPoint', screens: 'layouts', screen: 'Layout', vars: 'Theme slots & grid' },
  tokens: { label: 'Design tokens file', screens: 'screens', screen: 'Screen', vars: 'All tokens' },
  image: { label: 'Images', screens: 'images', screen: 'Image', vars: 'Variables' },
  pdf: { label: 'PDF', screens: 'pages', screen: 'Page', vars: 'Variables' },
  sketch: { label: 'Sketch file', screens: 'artboards', screen: 'Artboard', vars: 'Swatches & text styles' },
};
export const kindOf = atlas => KINDS[atlas?.project?.kind] || KINDS.web;
