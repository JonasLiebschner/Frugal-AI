using FrugalApi.Dashboard.Api.Models;
using FrugalApi.Dashboard.Api.Services;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddTransient<IDashboardDataService, DashboardDataService>();
builder.Services.AddSingleton<IStarsService, StarsService>();
builder.Services
    .AddOptions<VictoriaOptions>()
    .Bind(builder.Configuration.GetSection(VictoriaOptions.SectionName))
    .Validate(x => !string.IsNullOrWhiteSpace(x.Url), "Victoria:Url is required")
    .ValidateOnStart();

builder.Services
    .AddOptions<ModelEnvironmentalMetricsOptions>()
    .Bind(builder.Configuration.GetSection(ModelEnvironmentalMetricsOptions.SectionName));

builder.Services.AddHttpClient<ITraceDataService, VictoriaTraceDataService>((serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<IOptions<VictoriaOptions>>().Value;
    client.BaseAddress = new Uri(options.Url);
    client.Timeout = TimeSpan.FromSeconds(15);
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy
            .AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "Dashboard API v1");
    options.RoutePrefix = "swagger";
});

app.UseCors("Frontend");
app.UseAuthorization();
app.MapControllers();

await app.RunAsync();
