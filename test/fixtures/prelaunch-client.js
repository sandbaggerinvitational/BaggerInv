import React from 'react';
import {hydrateRoot} from 'react-dom/client';
import Presentation from './prelaunch-presentation';
hydrateRoot(document.getElementById('root'),<Presentation fixture={window.__fixture}/>);
