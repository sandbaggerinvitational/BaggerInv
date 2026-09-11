import React from 'react';
import {renderToString} from 'react-dom/server';
import Presentation from './prelaunch-presentation';
export function render(fixture){return renderToString(<Presentation fixture={fixture}/>);}
