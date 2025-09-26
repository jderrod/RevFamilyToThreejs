using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Newtonsoft.Json;
using RevitFamilyToGLB.Export;
using RevitFamilyToGLB.Models;

namespace RevitFamilyToGLB.Server
{
    public class LocalHttpServer
    {
        private HttpListener _listener;
        private Thread _serverThread;
        private bool _isRunning;
        private readonly int _port;
        private readonly UIApplication _uiApp;
        private readonly ExternalEvent _externalEvent;
        private readonly ParameterUpdateHandler _updateHandler;

        public LocalHttpServer(UIApplication uiApp, int port = 8080)
        {
            _uiApp = uiApp;
            _port = port;
            _updateHandler = new ParameterUpdateHandler();
            _externalEvent = ExternalEvent.Create(_updateHandler);
        }

        public void Start()
        {
            if (_isRunning) return;

            try
            {
                _listener = new HttpListener();
                _listener.Prefixes.Add($"http://localhost:{_port}/");
                _listener.Start();
                _isRunning = true;

                _serverThread = new Thread(ServerLoop)
                {
                    IsBackground = true
                };
                _serverThread.Start();

                TaskDialog.Show("Server Started", 
                    $"Local HTTP server started on port {_port}\n" +
                    $"Access at: http://localhost:{_port}/");
            }
            catch (Exception ex)
            {
                TaskDialog.Show("Server Error", 
                    $"Failed to start server: {ex.Message}\n" +
                    "Make sure the port is not already in use.");
            }
        }

        public void Stop()
        {
            if (!_isRunning) return;

            _isRunning = false;
            _listener?.Stop();
            _serverThread?.Join(1000);
            _listener?.Close();
        }

        private void ServerLoop()
        {
            while (_isRunning)
            {
                try
                {
                    var context = _listener.GetContext();
                    Task.Run(() => HandleRequest(context));
                }
                catch (Exception ex)
                {
                    if (_isRunning)
                    {
                        Console.WriteLine($"Server error: {ex.Message}");
                    }
                }
            }
        }

        private async Task HandleRequest(HttpListenerContext context)
        {
            var request = context.Request;
            var response = context.Response;

            // Enable CORS
            response.Headers.Add("Access-Control-Allow-Origin", "*");
            response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
            response.Headers.Add("Access-Control-Allow-Headers", "Content-Type");

            if (request.HttpMethod == "OPTIONS")
            {
                response.StatusCode = 200;
                response.Close();
                return;
            }

            try
            {
                switch (request.Url.AbsolutePath)
                {
                    case "/api/update":
                        await HandleParameterUpdate(context);
                        break;

                    case "/api/export":
                        await HandleExport(context);
                        break;

                    case "/api/status":
                        await HandleStatus(context);
                        break;

                    default:
                        response.StatusCode = 404;
                        await WriteResponse(response, "Not found");
                        break;
                }
            }
            catch (Exception ex)
            {
                response.StatusCode = 500;
                await WriteResponse(response, JsonConvert.SerializeObject(new 
                { 
                    error = ex.Message 
                }));
            }
        }

        private async Task HandleParameterUpdate(HttpListenerContext context)
        {
            if (context.Request.HttpMethod != "POST")
            {
                context.Response.StatusCode = 405;
                await WriteResponse(context.Response, "Method not allowed");
                return;
            }

            // Read request body
            string requestBody;
            using (var reader = new StreamReader(context.Request.InputStream))
            {
                requestBody = await reader.ReadToEndAsync();
            }

            var updateRequest = JsonConvert.DeserializeObject<ParameterUpdateRequest>(requestBody);
            
            // Update parameters in Revit (must be done in Revit context)
            _updateHandler.UpdateRequest = updateRequest;
            _updateHandler.Response = null;
            _externalEvent.Raise();

            // Wait for update to complete (with timeout)
            int attempts = 0;
            while (_updateHandler.Response == null && attempts < 100)
            {
                await Task.Delay(100);
                attempts++;
            }

            if (_updateHandler.Response != null)
            {
                context.Response.StatusCode = 200;
                context.Response.ContentType = "application/octet-stream";
                await context.Response.OutputStream.WriteAsync(
                    _updateHandler.Response, 
                    0, 
                    _updateHandler.Response.Length);
            }
            else
            {
                context.Response.StatusCode = 500;
                await WriteResponse(context.Response, "Update timeout");
            }

            context.Response.Close();
        }

        private async Task HandleExport(HttpListenerContext context)
        {
            // Similar to update but exports current state
            _updateHandler.ExportRequest = true;
            _updateHandler.Response = null;
            _externalEvent.Raise();

            // Wait for export to complete
            int attempts = 0;
            while (_updateHandler.Response == null && attempts < 100)
            {
                await Task.Delay(100);
                attempts++;
            }

            if (_updateHandler.Response != null)
            {
                context.Response.StatusCode = 200;
                context.Response.ContentType = "application/octet-stream";
                await context.Response.OutputStream.WriteAsync(
                    _updateHandler.Response, 
                    0, 
                    _updateHandler.Response.Length);
            }
            else
            {
                context.Response.StatusCode = 500;
                await WriteResponse(context.Response, "Export timeout");
            }

            context.Response.Close();
        }

        private async Task HandleStatus(HttpListenerContext context)
        {
            var status = new
            {
                running = true,
                port = _port,
                version = "1.0.0"
            };

            context.Response.StatusCode = 200;
            await WriteResponse(context.Response, JsonConvert.SerializeObject(status));
            context.Response.Close();
        }

        private async Task WriteResponse(HttpListenerResponse response, string content)
        {
            response.ContentType = "application/json";
            var buffer = Encoding.UTF8.GetBytes(content);
            response.ContentLength64 = buffer.Length;
            await response.OutputStream.WriteAsync(buffer, 0, buffer.Length);
        }
    }

    public class ParameterUpdateRequest
    {
        public Dictionary<string, object> Parameters { get; set; }
        public string TypeName { get; set; }
        public ViewDetailLevel DetailLevel { get; set; } = ViewDetailLevel.Fine;
    }

    public class ParameterUpdateHandler : IExternalEventHandler
    {
        public ParameterUpdateRequest UpdateRequest { get; set; }
        public bool ExportRequest { get; set; }
        public byte[] Response { get; set; }

        public void Execute(UIApplication app)
        {
            try
            {
                var doc = app.ActiveUIDocument.Document;
                
                if (!doc.IsFamilyDocument)
                {
                    Response = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(new
                    {
                        error = "Not a family document"
                    }));
                    return;
                }

                var familyManager = doc.FamilyManager;

                if (UpdateRequest != null)
                {
                    // Apply parameter updates
                    using (Transaction trans = new Transaction(doc, "Update Parameters"))
                    {
                        trans.Start();

                        foreach (var kvp in UpdateRequest.Parameters)
                        {
                            var param = familyManager.get_Parameter(kvp.Key);
                            if (param != null && !param.IsReporting)
                            {
                                try
                                {
                                    switch (param.StorageType)
                                    {
                                        case StorageType.Double:
                                            if (kvp.Value is double d)
                                            {
                                                familyManager.Set(param, d);
                                            }
                                            break;
                                        case StorageType.Integer:
                                            if (kvp.Value is int i)
                                            {
                                                familyManager.Set(param, i);
                                            }
                                            break;
                                        case StorageType.String:
                                            familyManager.Set(param, kvp.Value.ToString());
                                            break;
                                    }
                                }
                                catch (Exception ex)
                                {
                                    Console.WriteLine($"Failed to set parameter {kvp.Key}: {ex.Message}");
                                }
                            }
                        }

                        trans.Commit();
                    }
                }

                // Regenerate and export
                doc.Regenerate();
                
                // Export to GLB
                var geometryExtractor = new GeometryExtractor(doc, ViewDetailLevel.Fine);
                var geometryData = geometryExtractor.ExtractGeometry();
                
                var parameterSchema = CollectParameterSchema(familyManager);
                var parameterValues = CollectParameterValues(familyManager, parameterSchema);
                
                var exportedType = new ExportedFamilyType
                {
                    Name = familyManager.CurrentType.Name,
                    ParameterValues = parameterValues,
                    Geometry = geometryData
                };

                var relationshipExtractor = new ParameterRelationshipExtractor(doc, familyManager);
                var relationships = relationshipExtractor.ExtractRelationships(parameterSchema);

                var glbExporter = new GLBExporter();
                using (var ms = new MemoryStream())
                {
                    var tempPath = Path.GetTempFileName();
                    var result = glbExporter.Export(
                        new List<ExportedFamilyType> { exportedType },
                        parameterSchema,
                        relationships,
                        tempPath);

                    if (result.Success)
                    {
                        Response = File.ReadAllBytes(tempPath);
                        File.Delete(tempPath);
                    }
                    else
                    {
                        Response = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(new
                        {
                            error = result.ErrorMessage
                        }));
                    }
                }

                // Clear requests
                UpdateRequest = null;
                ExportRequest = false;
            }
            catch (Exception ex)
            {
                Response = Encoding.UTF8.GetBytes(JsonConvert.SerializeObject(new
                {
                    error = ex.Message
                }));
            }
        }

        public string GetName()
        {
            return "Parameter Update Handler";
        }

        private List<ParameterInfo> CollectParameterSchema(FamilyManager familyManager)
        {
            var schema = new List<ParameterInfo>();
            
            foreach (FamilyParameter param in familyManager.Parameters)
            {
                var info = new ParameterInfo
                {
                    Name = param.Definition.Name,
                    IsInstance = param.IsInstance,
                    IsReporting = param.IsReporting,
                    IsShared = param.IsShared,
                    StorageType = param.StorageType.ToString(),
                    Formula = param.Formula
                };

                if (param.IsShared && param.Definition is ExternalDefinition extDef)
                {
                    info.Guid = extDef.GUID.ToString();
                }

                schema.Add(info);
            }
            
            return schema;
        }

        private Dictionary<string, object> CollectParameterValues(
            FamilyManager familyManager, 
            List<ParameterInfo> schema)
        {
            var values = new Dictionary<string, object>();
            
            foreach (var paramInfo in schema)
            {
                var param = familyManager.get_Parameter(paramInfo.Name);
                if (param == null) continue;

                object value = null;
                
                switch (param.StorageType)
                {
                    case StorageType.Double:
                        var doubleVal = familyManager.CurrentType.AsDouble(param);
                        value = doubleVal.HasValue ? doubleVal.Value : 0.0;
                        break;
                    case StorageType.Integer:
                        var intVal = familyManager.CurrentType.AsInteger(param);
                        value = intVal.HasValue ? intVal.Value : 0;
                        break;
                    case StorageType.String:
                        value = familyManager.CurrentType.AsString(param);
                        break;
                    case StorageType.ElementId:
                        var id = familyManager.CurrentType.AsElementId(param);
                        value = id?.Value ?? -1;
                        break;
                }
                
                if (value != null)
                {
                    values[paramInfo.Name] = value;
                }
            }
            
            return values;
        }
    }
}
