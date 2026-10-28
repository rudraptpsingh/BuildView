import React from 'react';
import { canDownload } from '@/policy/access';
export function Gallery() {
  return React.createElement('div', null, String(canDownload('g')));
}
