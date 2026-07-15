import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://cogni-code.dev',
  integrations: [
    starlight({
      title: 'Cogni-Code',
      logo: {
        src: './src/assets/logo.svg',
        replacesTitle: true,
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/ConnorCallahan01/cogni-code' },
      ],
      customCss: ['./src/styles/global.css'],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'getting-started' },
            { label: 'Install', slug: 'install' },
            { label: 'Quick Start', slug: 'quick-start' },
            { label: 'Harnesses & Providers', slug: 'harnesses' },
          ],
        },
        {
          label: 'Concepts',
          items: [
            { label: 'How it Works', slug: 'how-it-works' },
            { label: 'The Memory Model', slug: 'memory-model' },
            { label: 'The Pipeline', slug: 'pipeline' },
          ],
        },
        {
          label: 'Features',
          items: [
            { label: 'Notion Sync', slug: 'notion-sync' },
            { label: 'Skills', slug: 'skills' },
            { label: 'Dashboard', slug: 'dashboard' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Tool Reference', slug: 'tool-reference' },
            { label: 'Slash Commands', slug: 'slash-commands' },
            { label: 'Where Memory Lives', slug: 'storage' },
            { label: 'Project Structure', slug: 'project-structure' },
          ],
        },
      ],
    }),
  ],
});
