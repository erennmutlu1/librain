# LIBRAIN API image. Build context = repo root.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
# global.json is deliberately not copied: it pins SDK >= 10.0.203, while the official
# sdk:10.0 image ships the 10.0.1xx band, and latestFeature does not roll back.
COPY LIBRAIN/LIBRAIN.csproj LIBRAIN/
RUN dotnet restore LIBRAIN/LIBRAIN.csproj
COPY LIBRAIN/ LIBRAIN/
RUN dotnet publish LIBRAIN/LIBRAIN.csproj -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
# Non-root user shipped with the official .NET images.
USER $APP_UID
ENTRYPOINT ["dotnet", "LIBRAIN.dll"]
