import { bootstrapApplication } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import Aura from '@primeng/themes/aura';
import { provideEchartsCore } from 'ngx-echarts';
import { providePrimeNG } from 'primeng/config';
import { MessageService } from 'primeng/api';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { AppComponent } from './app/app.component';
import { appRoutes } from './app/app.routes';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

bootstrapApplication(AppComponent, {
  providers: [
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.app-dark'
        }
      }
    }),
    provideHttpClient(),
    MessageService,
    provideRouter(appRoutes),
    provideEchartsCore({ echarts })
  ]
}).catch((err) => {
  console.error(err);
});
